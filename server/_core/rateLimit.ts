/**
 * Rate limiting for expensive operations.
 *
 * The expensive endpoints here are the ones that spend someone else's quota or the
 * machine's own resources: a Hub search, a model download, a local inference run. A
 * runaway loop or an impatient double-click should not be able to burn a user's Hugging
 * Face allowance or start four 30 GB downloads.
 *
 * This is a token bucket per user per operation, with a burst allowance so normal use is
 * never interrupted — only sustained hammering is. It reports what is left, so the UI can
 * show a real number instead of a surprise error.
 */

export type RateLimitRule = {
  /** Requests allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Extra requests allowed at once, so a burst is not an error. */
  burst?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Milliseconds until the next request would be allowed. */
  retryAfterMs: number;
};

type Bucket = { tokens: number; updatedAt: number; consumed: number };

/**
 * Named rules, chosen from what each operation actually costs.
 *
 * The search rule is generous because browsing is cheap and a slow search box is worse
 * than a fast one. Downloads and inference are strict because both are genuinely
 * expensive and neither is something a person does dozens of times a minute.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  "aiStore.search": { limit: 60, windowMs: 60_000, burst: 20 },
  "aiStore.detail": { limit: 120, windowMs: 60_000, burst: 40 },
  "aiStore.install": { limit: 5, windowMs: 10 * 60_000, burst: 2 },
  "aiStore.run": { limit: 20, windowMs: 60_000, burst: 5 },
  "aiStore.compare": { limit: 10, windowMs: 60_000, burst: 3 },
  "tools.install": { limit: 10, windowMs: 10 * 60_000, burst: 3 },
};

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rules: Record<string, RateLimitRule> = RATE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  private ruleFor(operation: string): RateLimitRule | undefined {
    return this.rules[operation];
  }

  /** Take a token if one is available. */
  check(userId: number, operation: string): RateLimitResult {
    const rule = this.ruleFor(operation);
    if (!rule) {
      // An operation with no declared rule is not limited. Silence is better than a
      // guessed limit that blocks legitimate work.
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, limit: Number.MAX_SAFE_INTEGER, retryAfterMs: 0 };
    }

    const capacity = rule.limit + (rule.burst ?? 0);
    const key = `${userId}:${operation}`;
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now, consumed: 0 };

    // Refill proportionally to the time that passed.
    const elapsed = Math.max(0, now - bucket.updatedAt);
    const refill = (elapsed / rule.windowMs) * rule.limit;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      const deficit = 1 - bucket.tokens;
      const retryAfterMs = Math.ceil((deficit / rule.limit) * rule.windowMs);
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: 0, limit: rule.limit, retryAfterMs };
    }

    bucket.tokens -= 1;
    bucket.consumed += 1;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: Math.floor(bucket.tokens), limit: rule.limit, retryAfterMs: 0 };
  }

  /** What a user has spent, for the diagnostics surface. */
  usage(userId?: number): Record<string, { consumed: number; limit: number }> {
    const out: Record<string, { consumed: number; limit: number }> = {};
    for (const [key, bucket] of Array.from(this.buckets.entries())) {
      const [owner, operation] = key.split(":");
      if (userId !== undefined && Number(owner) !== userId) continue;
      out[operation] = { consumed: bucket.consumed, limit: this.rules[operation]?.limit ?? 0 };
    }
    return out;
  }

  reset(userId?: number): void {
    if (userId === undefined) {
      this.buckets.clear();
      return;
    }
    for (const key of Array.from(this.buckets.keys())) {
      if (key.startsWith(`${userId}:`)) this.buckets.delete(key);
    }
  }
}

export const limiter = new RateLimiter();

/**
 * Thrown when a limit is hit.
 *
 * The message is written for the person reading it, and says how long to wait rather
 * than only that they were refused.
 */
export class RateLimitError extends Error {
  constructor(operation: string, retryAfterMs: number) {
    const seconds = Math.ceil(retryAfterMs / 1000);
    super(`Too many ${operation} requests. Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`);
    this.name = "RateLimitError";
  }
}

/** Take a token or throw. The shape tRPC procedures can use directly. */
export function enforceRateLimit(userId: number, operation: string): RateLimitResult {
  const result = limiter.check(userId, operation);
  if (!result.allowed) throw new RateLimitError(operation, result.retryAfterMs);
  return result;
}
