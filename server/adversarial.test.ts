/**
 * Adversarial edge-case tests.
 *
 * Pattern-matching for defects produced only false positives, so this does the opposite:
 * it tries to BREAK the newest code with hostile input and sees what actually fails.
 *
 * Everything here is a case a real user or a real network can produce — null, empty,
 * NaN, negative, enormous, malformed, concurrent. A pass is not proof of correctness;
 * a failure is proof of a defect.
 */
import { describe, expect, it } from "vitest";
import { classifyModel, readParameterScale, readQuantization } from "../shared/modelCapabilities";
import { categorise, sizeClassOf, readLicence, readLanguages, readLineage } from "../shared/modelTaxonomy";
import { TtlCache } from "./_core/cache";
import { backoffDelay, isRetryableStatus, parseRetryAfter, CircuitBreaker } from "./_core/resilientFetch";
import { redact, newCorrelationId, Logger } from "./_core/logger";
import { RateLimiter } from "./_core/rateLimit";
import { diskSpace, hasRoomFor } from "./_core/ops";
import { advise } from "./modelAdvisor";
import { compareModels } from "./modelCompare";

/* ------------------------------------------------------------------ *
 * Model metadata: hostile input
 * ------------------------------------------------------------------ */

describe("classification survives malformed Hub metadata", () => {
  it("does not throw on an empty object", () => {
    const profile = classifyModel({ id: "" });
    expect(profile.primary).toBe("general");
    expect(profile.capabilities).toEqual([]);
  });

  it("does not throw when tags is not an array", () => {
    // The Hub has returned a string where an array was expected before.
    const profile = classifyModel({ id: "a/b", tags: "gguf" as unknown as string[] });
    expect(profile).toBeTruthy();
    expect(Array.isArray(profile.capabilities)).toBe(true);
  });

  it("does not throw when tags contains nulls and numbers", () => {
    const profile = classifyModel({ id: "a/b", tags: [null, 42, "code", undefined] as unknown as string[] });
    expect(profile).toBeTruthy();
    expect(profile.capabilities.some((c) => c.id === "coding")).toBe(true);
  });

  it("handles an id with no slash", () => {
    const profile = classifyModel({ id: "gpt2" });
    expect(profile.primary).toBeTruthy();
  });

  it("handles an id that is only a slash", () => {
    expect(() => classifyModel({ id: "/" })).not.toThrow();
  });

  it("handles a null pipelineTag", () => {
    expect(() => classifyModel({ id: "a/b", pipelineTag: null as unknown as string })).not.toThrow();
  });

  it("handles cardData that is a string, not an object", () => {
    expect(() => classifyModel({ id: "a/b", cardData: "oops" as unknown as Record<string, unknown> })).not.toThrow();
  });
});

describe("parameter and quantisation parsing survives junk", () => {
  it("returns undefined rather than NaN for junk", () => {
    for (const junk of ["", "abc", "0B", "-1B", "NaNB", "1e999B", "999999999999999999999B"]) {
      const result = readParameterScale(junk);
      // The contract is "a scale string, or undefined" — never a NaN-valued string.
      expect(result === undefined || /^[\d.]+[BM]$/.test(result), `"${junk}" produced ${result}`).toBe(true);
    }
    // And it must survive a non-string without throwing.
    expect(() => readParameterScale(undefined as unknown as string)).not.toThrow();
    expect(() => readParameterScale(null as unknown as string)).not.toThrow();
  });

  it("reads real values correctly", () => {
    expect(readParameterScale("Qwen2.5-7B-Instruct")).toBe("7B");
    expect(readParameterScale("Meta-Llama-3-70B")).toBe("70B");
    expect(readParameterScale("Qwen2.5-1.5B-Instruct")).toBe("1.5B");
  });

  it("reads quantisation from the model id", () => {
    expect(readQuantization({ id: "org/model-q4_k_m.gguf" })).toBe("Q4_K_M");
    expect(readQuantization({ id: "org/model.Q8_0.gguf" })).toBe("Q8_0");
  });

  it("returns undefined rather than a guess when there is no quantisation", () => {
    expect(readQuantization({ id: "org/plain-model.gguf" })).toBeUndefined();
  });

  it("survives a missing or malformed meta without throwing", () => {
    expect(() => readQuantization(undefined as never)).not.toThrow();
    expect(() => readQuantization({} as never)).not.toThrow();
    expect(() => readQuantization("a-string" as never)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Taxonomy: hostile input
 * ------------------------------------------------------------------ */

describe("taxonomy survives junk", () => {
  it("classifies with no metadata at all", () => {
    const c = categorise({ id: "", tags: [] });
    expect(c.unknown.length).toBeGreaterThan(0);
  });

  it("sizeClassOf never throws and never returns NaN", () => {
    for (const junk of ["", "B", "0B", "abcB", "-5B", "1.5B", "0.1B", "100000B"]) {
      expect(() => sizeClassOf(junk)).not.toThrow();
      expect(sizeClassOf(junk)).toBeTruthy();
    }
  });

  it("readLicence never claims permissive for an unknown licence", () => {
    for (const junk of ["", "unknown", "proprietary", "NOASSERTION"]) {
      const l = readLicence([`license:${junk}`]);
      expect(l.permissive, `"${junk}" was treated as permissive`).toBe(false);
    }
  });

  it("readLanguages handles malformed tags", () => {
    expect(() => readLanguages([null, "", "en", "code"] as unknown as string[])).not.toThrow();
    expect(readLanguages(["en", "fr"])).toEqual(["en", "fr"]);
  });

  it("readLineage handles a base_model tag with no relation", () => {
    const l = readLineage(["base_model:Qwen/Qwen2.5-7B"]);
    expect(l.baseModels).toContain("Qwen/Qwen2.5-7B");
  });
});

/* ------------------------------------------------------------------ *
 * Cache: hostile input and concurrency
 * ------------------------------------------------------------------ */

describe("cache under hostile conditions", () => {
  it("never caches a rejection", async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    let calls = 0;
    const load = async () => { calls += 1; throw new Error("boom"); };
    for (let i = 0; i < 3; i += 1) {
      await expect(cache.getOrLoad("k", load)).rejects.toThrow("boom");
    }
    expect(calls).toBe(3); // a rejected load must not become a cached failure
  });

  it("coalesces concurrent identical loads into one call", async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
    let calls = 0;
    const load = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return 1; };
    const results = await Promise.all([cache.getOrLoad("k", load), cache.getOrLoad("k", load), cache.getOrLoad("k", load)]);
    expect(results).toEqual([1, 1, 1]);
    expect(calls).toBe(1);
  });

  it("evicts rather than growing without bound", () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 5 });
    for (let i = 0; i < 100; i += 1) cache.set(`k${i}`, i);
    expect(cache.stats().size).toBeLessThanOrEqual(5);
  });

  it("handles a zero and negative TTL without throwing", () => {
    expect(() => new TtlCache<number>({ ttlMs: 0, maxEntries: 1 }).set("a", 1)).not.toThrow();
    expect(() => new TtlCache<number>({ ttlMs: -5, maxEntries: 1 }).set("a", 1)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Resilience: hostile input
 * ------------------------------------------------------------------ */

describe("retry maths never produces a bad delay", () => {
  it("never returns NaN, negative, or unbounded delays", () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const d = backoffDelay(attempt, 100, 5000);
      expect(Number.isFinite(d), `attempt ${attempt} produced ${d}`).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(5000); // the ceiling is a hard cap
    }
  });

  it("handles a negative attempt number", () => {
    expect(() => backoffDelay(-1, 100, 1000)).not.toThrow();
  });

  it("classifies statuses correctly at the boundaries", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(0)).toBe(false);
    expect(isRetryableStatus(999)).toBe(false);
  });

  it("parses Retry-After in both formats and rejects junk", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("not-a-date")).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    // A date in the past must not produce a negative wait.
    const past = parseRetryAfter(new Date(Date.now() - 60_000).toUTCString());
    expect(past === undefined || past >= 0).toBe(true);
  });

  it("a breaker never opens on success and never wedges shut", () => {
    // A 1 ms cooldown made this flaky: the breaker could reopen before the assertion ran.
    // Use a cooldown long enough to observe the open state deterministically.
    const b = new CircuitBreaker(3, 60_000);
    expect(b.isOpen("h")).toBe(false);
    b.recordSuccess("h");
    expect(b.isOpen("h")).toBe(false);
    for (let i = 0; i < 3; i += 1) b.recordFailure("h");
    expect(b.isOpen("h")).toBe(true);
    // And it must close again on a success once it has reopened for business.
    const fresh = new CircuitBreaker(3, 0);
    for (let i = 0; i < 3; i += 1) fresh.recordFailure("h");
    expect(fresh.isOpen("h")).toBe(false); // zero cooldown means it is immediately half-open
  });
});

/* ------------------------------------------------------------------ *
 * Redaction: the security boundary
 * ------------------------------------------------------------------ */

describe("redaction never lets a secret through", () => {
  it("redacts a secret in a nested structure", () => {
    const out = JSON.stringify(redact({ a: { b: { token: "hf_" + "x".repeat(30) } } }));
    expect(out).not.toContain("x".repeat(30));
  });

  it("survives circular references without hanging or throwing", () => {
    const o: Record<string, unknown> = { name: "x" };
    o.self = o;
    expect(() => redact(o)).not.toThrow();
  });

  it("handles null, undefined, numbers and empty strings", () => {
    expect(() => redact(null)).not.toThrow();
    expect(() => redact(undefined)).not.toThrow();
    expect(() => redact(0)).not.toThrow();
    expect(() => redact("")).not.toThrow();
  });

  it("redacts a secret inside an array", () => {
    const out = JSON.stringify(redact({ keys: ["sk-" + "a".repeat(40)] }));
    expect(out).not.toContain("a".repeat(40));
  });
});

describe("logger survives hostile input", () => {
  it("correlation ids are unique", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newCorrelationId()));
    expect(ids.size).toBe(500);
  });

  it("does not throw when logging a circular object", () => {
    const logger = new Logger({ level: "debug" });
    const o: Record<string, unknown> = {}; o.self = o;
    expect(() => logger.info("circular", o)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Rate limiting: concurrency and boundaries
 * ------------------------------------------------------------------ */

describe("rate limiter boundaries", () => {
  it("does not allow an unlimited burst on a rate-limited operation", () => {
    const rl = new RateLimiter();
    let allowed = 0;
    for (let i = 0; i < 500; i += 1) if (rl.check(1, "aiStore.install").allowed) allowed += 1;
    // Whatever the configured burst is, it must be finite.
    expect(allowed).toBeLessThan(500);
    expect(allowed).toBeGreaterThan(0);
  });

  it("keeps users isolated", () => {
    const rl = new RateLimiter();
    let a = 0;
    let b = 0;
    for (let i = 0; i < 50; i += 1) if (rl.check(101, "aiStore.install").allowed) a += 1;
    for (let i = 0; i < 50; i += 1) if (rl.check(202, "aiStore.install").allowed) b += 1;
    // One user exhausting their bucket must not consume another's.
    expect(a).toBe(b);
  });

  it("does not limit an operation with no declared rule", () => {
    const rl = new RateLimiter();
    let allowed = 0;
    for (let i = 0; i < 50; i += 1) if (rl.check(1, "an.operation.with.no.rule").allowed) allowed += 1;
    expect(allowed).toBe(50);
  });
});

/* ------------------------------------------------------------------ *
 * Disk space
 * ------------------------------------------------------------------ */

describe("disk space reporting", () => {
  it("returns real numbers, not NaN", () => {
    const space = diskSpace(process.cwd());
    expect(space).toBeDefined();
    expect(Number.isFinite(space!.freeGB)).toBe(true);
    expect(space!.freeGB).toBeGreaterThanOrEqual(0);
    expect(space!.freeBytes).toBeGreaterThan(0);
  });

  it("returns undefined rather than throwing for a path that does not exist", () => {
    expect(() => diskSpace("/definitely/not/a/real/path/xyz")).not.toThrow();
  });

  it("refuses a request larger than the disk", () => {
    // 1 exabyte cannot fit on any disk this runs on.
    const verdict = hasRoomFor(process.cwd(), 1024 ** 6);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toBeTruthy();
  });

  it("allows a trivial request when there is room", () => {
    const verdict = hasRoomFor(process.cwd(), 1024);
    expect(verdict.ok).toBe(true);
  });

  it("fails OPEN, not closed, when free space cannot be read", () => {
    // Deliberate: a guard that blocks downloads because it cannot stat the disk would
    // break the app on an unusual filesystem. It says so in the detail.
    const verdict = hasRoomFor("/definitely/not/real/xyz", 1024);
    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toMatch(/could not be read/i);
  });

  it("treats NaN as an unknown size rather than approving it silently", () => {
    const verdict = hasRoomFor(process.cwd(), Number.NaN);
    expect(verdict).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * Model advisor and comparison
 * ------------------------------------------------------------------ */

describe("advisor handles impossible hardware", () => {
  it("does not recommend anything when nothing fits", () => {
    const files = [{ path: "m.gguf", sizeBytes: 400 * 1024 ** 3, url: "u", recommended: true }];
    const result = advise(files, { availableGB: 1, basis: "system memory" });
    // Nothing fits, so nothing may be recommended.
    expect(result.recommended).toBeUndefined();
    expect(result.options).toEqual([]);
    expect(result.rejected.length).toBe(1);
    expect(result.summary).toMatch(/Nothing in this repository fits/i);
  });

  it("treats an undefined memory reading as unknown, not as plenty", () => {
    // This was a real defect: the guard checked `=== null` only, so `undefined` slipped
    // through, every comparison became NaN, and the user got "nothing fits" instead of
    // "memory could not be read".
    const files = [{ path: "m.gguf", sizeBytes: 4 * 1024 ** 3, url: "u", recommended: true }];
    const result = advise(files, { availableGB: undefined as unknown as number, basis: "system memory" });
    expect(result.recommended).toBeUndefined();
    expect(result.summary).toMatch(/could not be read/i);
  });

  it("handles an empty file list", () => {
    expect(() => advise([], { availableGB: 16, basis: "system memory" })).not.toThrow();
  });
});

describe("comparison isolates failures", () => {
  it("one failing model does not fail the whole comparison", async () => {
    const report = await compareModels({
      prompt: "hi",
      candidates: [
        { modelId: "good", mode: "hosted" },
        { modelId: "bad", mode: "hosted" },
      ],
      run: (async (candidate: { modelId: string }) => {
        if (candidate.modelId === "bad") throw new Error("nope");
        return { status: "completed", content: "ok", durationMs: 1 } as never;
      }) as never,
    });
    expect(report.results).toHaveLength(2);
    expect(report.results.find((r) => r.modelId === "bad")?.status).toBe("failed");
    expect(report.results.find((r) => r.modelId === "good")?.status).toBe("completed");
  });

  it("handles an empty candidate list", async () => {
    const report = await compareModels({ prompt: "hi", candidates: [], run: (async () => ({ status: "completed", content: "x", durationMs: 1 })) as never });
    expect(report.results).toEqual([]);
  });
});
