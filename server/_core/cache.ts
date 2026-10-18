/**
 * Caching, and coalescing of concurrent identical work.
 *
 * Two problems this solves, both of which show up as "the app feels slow":
 *
 * 1. **Repeat work.** The AI Store asks the Hub for the same search, or the same model's
 *    file list, every time a component remounts or a user navigates back. A short TTL
 *    cache turns that from a network round trip into a memory read.
 * 2. **Thundering herd.** Three components mounting at once each fire the same request.
 *    Coalescing means the second and third callers await the first caller's promise
 *    instead of starting their own.
 *
 * Bounded by design: this runs inside a desktop app that may stay open for weeks, so the
 * cache has a maximum size and evicts the least recently used entry. An unbounded cache
 * is a memory leak with a friendly name.
 */

type Entry<T> = { value: T; expiresAt: number };

export type CacheOptions = {
  /** How long a value stays fresh, in milliseconds. */
  ttlMs: number;
  /** Maximum entries retained. Least recently used is evicted first. */
  maxEntries?: number;
  /** Injectable clock, so expiry is testable without waiting. */
  now?: () => number;
};

export type CacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  coalesced: number;
  size: number;
};

/**
 * A TTL cache with LRU eviction and in-flight coalescing.
 *
 * `getOrLoad` is the only method callers normally need.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private coalesced = 0;

  constructor(options: CacheOptions) {
    this.ttlMs = Math.max(0, options.ttlMs);
    this.maxEntries = Math.max(1, options.maxEntries ?? 200);
    this.now = options.now ?? (() => Date.now());
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      // Map preserves insertion order, and we re-insert on read, so the first key is
      // the least recently used.
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    this.evictIfNeeded();
  }

  /**
   * Return the cached value, or load it — and if a load for the same key is already
   * running, await that instead of starting a second one.
   *
   * A rejected load is never cached, so a transient failure does not poison the entry.
   */
  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) {
      this.coalesced += 1;
      return existing;
    }

    const promise = (async () => {
      try {
        const value = await load();
        this.set(key, value);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Drop one key. Returns whether it was present. */
  invalidate(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Drop everything whose key starts with the prefix. Returns how many were removed. */
  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      coalesced: this.coalesced,
      size: this.entries.size,
    };
  }
}

/**
 * Process-wide caches, keyed by what they hold.
 *
 * The TTLs are chosen from how often the underlying data actually changes: the Hub's
 * release list changes rarely, a search result is only worth a couple of minutes, and a
 * model's file listing changes only when the author uploads.
 */
export const caches = {
  /** Hugging Face search results. */
  modelSearch: new TtlCache<unknown>({ ttlMs: 2 * 60_000, maxEntries: 120 }),
  /** A single model's metadata and file listing. */
  modelDetail: new TtlCache<unknown>({ ttlMs: 10 * 60_000, maxEntries: 200 }),
  /** GitHub release listings for tool installs. */
  toolRelease: new TtlCache<unknown>({ ttlMs: 30 * 60_000, maxEntries: 120 }),
  /** Adapter health, which is cheap but called from several panels at once. */
  adapterHealth: new TtlCache<unknown>({ ttlMs: 5_000, maxEntries: 40 }),
};

/** Every cache's statistics, for the diagnostics surface. */
export function cacheStats(): Record<string, CacheStats> {
  const out: Record<string, CacheStats> = {};
  for (const key of Object.keys(caches) as Array<keyof typeof caches>) {
    out[key] = caches[key].stats();
  }
  return out;
}

/** Clear every cache. Used after an install or a token change. */
export function clearAllCaches(): void {
  for (const key of Object.keys(caches) as Array<keyof typeof caches>) {
    caches[key].clear();
  }
}
