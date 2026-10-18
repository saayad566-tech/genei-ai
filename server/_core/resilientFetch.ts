/**
 * Outbound requests that survive a bad minute.
 *
 * Remote services fail in ways that are usually temporary: a 503, a rate limit, a
 * connection reset. Retrying those is correct. Retrying a 404 is not — it will fail
 * identically forever, and retrying it just makes the user wait three times as long.
 *
 * So this distinguishes:
 *  - **Retryable**: network errors, 408, 425, 429, 500, 502, 503, 504.
 *  - **Terminal**: everything else, returned immediately.
 *
 * `Retry-After` is honoured when the server sends it, because guessing shorter than the
 * server asked is how a rate limit turns into a ban.
 *
 * A circuit breaker stops hammering a service that is clearly down, and closes again on
 * its own after a cooldown — so one outage cannot make every screen in the app slow.
 */

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  /** Injected for tests, so backoff does not make the suite slow. */
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  /** Called on each retry, for logging. */
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Parse a Retry-After header in either of its two legal forms. */
export function parseRetryAfter(value: string | null, now: () => number = Date.now): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now());
  return undefined;
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters when several callers retry at once: without it they retry in lockstep
 * and recreate the spike that caused the failure.
 */
export function backoffDelay(attempt: number, baseDelayMs = 300, maxDelayMs = 8_000, random: () => number = Math.random): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

/* ------------------------------------------------------------------ *
 * Circuit breaker
 * ------------------------------------------------------------------ */

type BreakerState = { failures: number; openUntil: number };

export class CircuitBreaker {
  private readonly state = new Map<string, BreakerState>();

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  isOpen(host: string): boolean {
    const entry = this.state.get(host);
    if (!entry) return false;
    if (entry.openUntil <= this.now()) {
      // Cooldown elapsed: allow a trial request through.
      this.state.delete(host);
      return false;
    }
    return true;
  }

  recordSuccess(host: string): void {
    this.state.delete(host);
  }

  recordFailure(host: string): void {
    const entry = this.state.get(host) ?? { failures: 0, openUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.threshold) {
      entry.openUntil = this.now() + this.cooldownMs;
    }
    this.state.set(host, entry);
  }

  /** For diagnostics and tests. */
  snapshot(): Record<string, { failures: number; open: boolean }> {
    const out: Record<string, { failures: number; open: boolean }> = {};
    for (const [host, entry] of Array.from(this.state.entries())) {
      out[host] = { failures: entry.failures, open: entry.openUntil > this.now() };
    }
    return out;
  }

  reset(): void {
    this.state.clear();
  }
}

export const breaker = new CircuitBreaker();

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Fetch with retries, backoff, timeouts and a circuit breaker.
 *
 * Resolves with the final `Response` — including a non-ok one — so the caller keeps its
 * existing status handling. It only rejects when the request could not be completed at
 * all, or when the breaker is open.
 */
export async function resilientFetch(url: string, init: RequestInit = {}, options: RetryOptions = {}): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const sleep = options.sleep ?? defaultSleep;
  const fetchImpl = options.fetchImpl ?? fetch;
  const host = hostOf(url);

  if (breaker.isOpen(host)) {
    throw new Error(`${host} is not responding and was recently failing, so this request was not attempted. It will be tried again automatically.`);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
      if (!isRetryableStatus(response.status)) {
        breaker.recordSuccess(host);
        return response;
      }

      // Retryable status. Honour Retry-After if the server sent one.
      lastError = new Error(`HTTP ${response.status}`);
      breaker.recordFailure(host);
      if (attempt === attempts) return response;

      const advised = parseRetryAfter(response.headers?.get?.("retry-after") ?? null);
      const delay = advised !== undefined ? Math.min(advised, maxDelayMs) : backoffDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.({ attempt, delayMs: delay, reason: `HTTP ${response.status}` });
      await sleep(delay);
    } catch (error) {
      // A network-level failure: worth retrying.
      lastError = error;
      breaker.recordFailure(host);
      if (attempt === attempts) break;
      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.({ attempt, delayMs: delay, reason: error instanceof Error ? error.message : "network error" });
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("The request could not be completed.");
}
