import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./_core/cache";
import { backoffDelay, breaker, CircuitBreaker, isRetryableStatus, parseRetryAfter, resilientFetch } from "./_core/resilientFetch";

/**
 * Caching, coalescing and retries.
 *
 * These are the pieces that make the app feel fast, so the tests are about the
 * properties that actually deliver that: a hit costs no work, concurrent identical
 * callers share one request, failures are never cached, and a retry only happens when
 * retrying could possibly help.
 */

describe("TTL cache", () => {
  it("returns a cached value without running the loader again", async () => {
    let calls = 0;
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    const load = async () => { calls += 1; return 42; };
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(calls).toBe(1);
    expect(cache.stats().hits).toBe(1);
  });

  it("expires a value once its TTL passes", async () => {
    let now = 0;
    let calls = 0;
    const cache = new TtlCache<number>({ ttlMs: 100, now: () => now });
    const load = async () => { calls += 1; return calls; };
    await cache.getOrLoad("k", load);
    now = 150;
    expect(await cache.getOrLoad("k", load)).toBe(2);
    expect(calls).toBe(2);
  });

  it("coalesces concurrent identical loads into one", async () => {
    let calls = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    const load = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return "value"; };
    const results = await Promise.all([cache.getOrLoad("k", load), cache.getOrLoad("k", load), cache.getOrLoad("k", load)]);
    expect(results).toEqual(["value", "value", "value"]);
    expect(calls).toBe(1);
    expect(cache.stats().coalesced).toBe(2);
  });

  it("never caches a rejection, so a transient failure does not stick", async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    await expect(cache.getOrLoad("k", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", async () => 7)).toBe(7);
  });

  it("bounds its size by evicting the least recently used", () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 3 });
    cache.set("a", 1); cache.set("b", 2); cache.set("c", 3);
    cache.get("a");            // 'a' becomes most recently used
    cache.set("d", 4);         // evicts 'b'
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.stats().evictions).toBe(1);
  });

  it("invalidates by key and by prefix", () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000 });
    cache.set("model:1", 1); cache.set("model:2", 2); cache.set("other", 3);
    expect(cache.invalidatePrefix("model:")).toBe(2);
    expect(cache.get("other")).toBe(3);
    expect(cache.invalidate("other")).toBe(true);
    expect(cache.invalidate("other")).toBe(false);
  });
});

describe("retry policy", () => {
  it("retries the statuses that can succeed later, and not the ones that cannot", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(status), String(status)).toBe(true);
    for (const status of [400, 401, 403, 404, 422]) expect(isRetryableStatus(status), String(status)).toBe(false);
  });

  it("honours Retry-After in both its forms", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", () => now)).toBe(5000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("nonsense")).toBeUndefined();
  });

  it("backs off exponentially and never exceeds the ceiling", () => {
    const noJitter = () => 1;
    expect(backoffDelay(1, 100, 10_000, noJitter)).toBe(100);
    expect(backoffDelay(2, 100, 10_000, noJitter)).toBe(200);
    expect(backoffDelay(3, 100, 10_000, noJitter)).toBe(400);
    expect(backoffDelay(20, 100, 10_000, noJitter)).toBe(10_000);
  });

  it("jitters so concurrent retries do not line up", () => {
    const values = new Set([backoffDelay(3, 100, 10_000, () => 0), backoffDelay(3, 100, 10_000, () => 0.99)]);
    expect(values.size).toBe(2);
  });
});

describe("resilientFetch", () => {
  const sleep = async () => undefined;

  it("returns a successful response without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const response = await resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 and succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const onRetry = vi.fn();
    const response = await resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep, onRetry });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ reason: "HTTP 503" }));
  });

  it("does not retry a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("gone", { status: 404 }));
    const response = await resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep });
    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget and returns the last response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    const response = await resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep, attempts: 3 });
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("waits as long as the server asked when it sends Retry-After", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const slept: number[] = [];
    await resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep: async (ms) => { slept.push(ms); } });
    expect(slept).toEqual([3000]);
  });

  it("retries a network failure and rethrows when it keeps failing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(resilientFetch("https://example.test/a", {}, { fetchImpl: fetchMock, sleep, attempts: 2 })).rejects.toThrow("ECONNRESET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("circuit breaker", () => {
  it("opens after the failure threshold and closes again after the cooldown", () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 1000, () => now);
    for (let i = 0; i < 3; i += 1) breaker.recordFailure("api.test");
    expect(breaker.isOpen("api.test")).toBe(true);
    now = 1001;
    expect(breaker.isOpen("api.test")).toBe(false);
  });

  it("resets on a success", () => {
    const breaker = new CircuitBreaker(2, 1000);
    breaker.recordFailure("api.test");
    breaker.recordSuccess("api.test");
    expect(breaker.isOpen("api.test")).toBe(false);
    expect(breaker.snapshot()["api.test"]).toBeUndefined();
  });

  it("refuses to call a host it knows is down, rather than making the user wait", async () => {
    // resilientFetch consults the module-level breaker, so the test drives that one.
    const fetchMock = vi.fn();
    try {
      for (let i = 0; i < 6; i += 1) breaker.recordFailure("down.test");
      await expect(
        resilientFetch("https://down.test/a", {}, { fetchImpl: fetchMock, sleep: async () => undefined, attempts: 3 }),
      ).rejects.toThrow(/not responding/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      breaker.reset();
    }
  });
});
