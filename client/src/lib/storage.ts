/**
 * Local persistence with versioning.
 *
 * Anything stored under a versioned key and never migrated becomes a support problem the
 * moment the shape changes: the app reads yesterday's object, a field is missing, and
 * something breaks for exactly the users who have been around longest.
 *
 * So every entry is versioned, migrations are explicit, a corrupt entry is discarded
 * rather than crashing the read, and a full quota is handled instead of thrown.
 */

export type StoredEntry<T> = { version: number; data: T; savedAt: number };

export type Migration = { from: number; to: number; migrate: (data: unknown) => unknown };

export class VersionedStore {
  constructor(
    private readonly prefix: string,
    private readonly migrations: Migration[] = [],
  ) {}

  private key(name: string): string {
    return `${this.prefix}:${name}`;
  }

  /**
   * Read a value, applying migrations in order.
   *
   * Returns the fallback when the entry is missing, corrupt, or from a version newer than
   * this build knows about — a downgrade must not read data it does not understand.
   */
  read<T>(name: string, currentVersion: number, fallback: T): T {
    if (typeof localStorage === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(this.key(name));
      if (!raw) return fallback;
      const entry = JSON.parse(raw) as StoredEntry<T>;
      if (typeof entry?.version !== "number") return fallback;
      if (entry.version > currentVersion) return fallback;

      let data: unknown = entry.data;
      let version = entry.version;
      while (version < currentVersion) {
        const migration = this.migrations.find((candidate) => candidate.from === version);
        if (!migration) break;
        data = migration.migrate(data);
        version = migration.to;
      }
      return data as T;
    } catch {
      // A corrupt entry is not worth crashing over; the fallback is the honest answer.
      return fallback;
    }
  }

  /** Write a value. Reports whether it fit rather than throwing on a full quota. */
  write<T>(name: string, version: number, data: T): { ok: boolean; error?: string } {
    if (typeof localStorage === "undefined") return { ok: false, error: "Local storage is not available." };
    const entry: StoredEntry<T> = { version, data, savedAt: Date.now() };
    try {
      localStorage.setItem(this.key(name), JSON.stringify(entry));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // A quota failure is recoverable by pruning; say so rather than failing silently.
      return {
        ok: false,
        error: /quota|exceeded/i.test(message)
          ? "Local storage is full. Older entries can be cleared to make room."
          : message,
      };
    }
  }

  remove(name: string): void {
    try { localStorage.removeItem(this.key(name)); } catch { /* nothing to do */ }
  }

  /** Every key this store owns, for a prune or an export. */
  keys(): string[] {
    if (typeof localStorage === "undefined") return [];
    const out: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${this.prefix}:`)) out.push(key.slice(this.prefix.length + 1));
    }
    return out;
  }

  /** Approximate bytes used, so a caller can decide whether to prune. */
  usageBytes(): number {
    if (typeof localStorage === "undefined") return 0;
    let total = 0;
    for (const name of this.keys()) {
      try { total += (localStorage.getItem(this.key(name))?.length ?? 0) * 2; } catch { /* skip */ }
    }
    return total;
  }

  /** Drop the oldest entries until under a byte budget. */
  pruneTo(maxBytes: number): number {
    if (typeof localStorage === "undefined") return 0;
    const entries = this.keys().map((name) => {
      const raw = localStorage.getItem(this.key(name));
      let savedAt = 0;
      try { savedAt = (JSON.parse(raw ?? "{}") as StoredEntry<unknown>).savedAt ?? 0; } catch { /* unparseable sorts first */ }
      return { name, savedAt, bytes: (raw?.length ?? 0) * 2 };
    }).sort((a, b) => a.savedAt - b.savedAt);

    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    let removed = 0;
    for (const entry of entries) {
      if (total <= maxBytes) break;
      this.remove(entry.name);
      total -= entry.bytes;
      removed += 1;
    }
    return removed;
  }
}

/** Session-scoped storage, cleared when the app closes. */
export const sessionStore = new VersionedStore("genei.session");
/** Long-lived preferences. */
export const preferenceStore = new VersionedStore("genei.prefs");
