import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diskSpace, hasRoomFor, liveness, metrics, readiness, resetCaches } from "./_core/ops";
import { RateLimiter, RATE_LIMITS } from "./_core/rateLimit";
import { compareModels, type CompareCandidate } from "./modelCompare";

/**
 * Operations, rate limiting and comparison.
 *
 * The theme is the same as everywhere else in this codebase: the numbers must be real.
 * Metrics read from the component that owns the counter, rate limits report what is left
 * rather than only refusing, and comparison latency is measured around the call.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-ops-"));

describe("disk space", () => {
  it("reads real free space", () => {
    const space = diskSpace(tmp());
    expect(space).toBeDefined();
    expect(space!.totalBytes).toBeGreaterThan(0);
    expect(space!.freeBytes).toBeGreaterThanOrEqual(0);
  });

  it("allows a download that fits, and names the room it counted", () => {
    const room = hasRoomFor(tmp(), 1024, 0);
    expect(room.ok).toBe(true);
    expect(room.detail).toMatch(/free/);
  });

  it("refuses a download that cannot possibly fit, before it starts", () => {
    // Larger than any disk, with no margin, so the refusal is unambiguous.
    const room = hasRoomFor(tmp(), Number.MAX_SAFE_INTEGER / 2, 0);
    expect(room.ok).toBe(false);
    expect(room.detail).toMatch(/free some space/i);
  });
});

describe("health and readiness", () => {
  it("reports liveness with a real uptime", () => {
    const live = liveness();
    expect(live.state).toBe("healthy");
    expect(live.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("checks the things that actually gate work", () => {
    const report = readiness({ dataDir: tmp() });
    const names = report.checks.map((check) => check.name);
    expect(names).toContain("data-directory");
    expect(names).toContain("disk-space");
    expect(names).toContain("outbound-hosts");
    expect(["healthy", "degraded", "unhealthy"]).toContain(report.state);
  });

  it("reports unhealthy when the data directory cannot be written", () => {
    const report = readiness({ dataDir: "/proc/definitely-not-writable" });
    const dir = report.checks.find((check) => check.name === "data-directory");
    expect(dir?.ok).toBe(false);
    expect(report.state).not.toBe("healthy");
  });

  it("surfaces a paused queue rather than reporting a flat ok", () => {
    const report = readiness({ dataDir: tmp(), queuePaused: true, queueDepth: 3 });
    expect(report.checks.find((check) => check.name === "job-queue")?.ok).toBe(false);
  });
});

describe("metrics", () => {
  it("reads real process and system counters", () => {
    const m = metrics();
    expect(m.process.rssMB).toBeGreaterThan(0);
    expect(m.system.cpuCount).toBeGreaterThan(0);
    expect(m.system.totalRamMB).toBeGreaterThan(0);
    expect(m.caches).toHaveProperty("modelSearch");
  });

  it("includes rate-limit usage when given it", () => {
    const m = metrics({ "aiStore.search": { consumed: 4, limit: 60 } });
    expect(m.rateLimits["aiStore.search"]).toEqual({ consumed: 4, limit: 60 });
  });

  it("can clear every cache and reports how much it dropped", () => {
    expect(typeof resetCaches()).toBe("number");
  });
});

describe("rate limiting", () => {
  it("allows normal use up to the limit", () => {
    const limiter = new RateLimiter({ op: { limit: 3, windowMs: 60_000 } });
    expect(limiter.check(1, "op").allowed).toBe(true);
    expect(limiter.check(1, "op").allowed).toBe(true);
    const third = limiter.check(1, "op");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("refuses past the limit and says how long to wait", () => {
    const limiter = new RateLimiter({ op: { limit: 1, windowMs: 60_000 } });
    limiter.check(1, "op");
    const refused = limiter.check(1, "op");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps users independent", () => {
    const limiter = new RateLimiter({ op: { limit: 1, windowMs: 60_000 } });
    limiter.check(1, "op");
    expect(limiter.check(2, "op").allowed).toBe(true);
  });

  it("refills over time", () => {
    let now = 0;
    const limiter = new RateLimiter({ op: { limit: 10, windowMs: 1000 } }, () => now);
    for (let i = 0; i < 10; i += 1) limiter.check(1, "op");
    expect(limiter.check(1, "op").allowed).toBe(false);
    now = 500; // half the window: five tokens back
    expect(limiter.check(1, "op").allowed).toBe(true);
  });

  it("allows a burst without treating it as abuse", () => {
    const limiter = new RateLimiter({ op: { limit: 5, windowMs: 60_000, burst: 3 } });
    let allowed = 0;
    for (let i = 0; i < 8; i += 1) if (limiter.check(1, "op").allowed) allowed += 1;
    expect(allowed).toBe(8);
  });

  it("does not limit an operation with no declared rule", () => {
    const limiter = new RateLimiter({});
    for (let i = 0; i < 100; i += 1) expect(limiter.check(1, "unruled").allowed).toBe(true);
  });

  it("has a rule for every expensive operation", () => {
    for (const operation of ["aiStore.search", "aiStore.install", "aiStore.run", "aiStore.compare"]) {
      expect(RATE_LIMITS[operation], `${operation} has no rule`).toBeDefined();
    }
    // Downloads and inference cost real time and quota; browsing must stay responsive.
    expect(RATE_LIMITS["aiStore.install"].limit).toBeLessThan(RATE_LIMITS["aiStore.search"].limit);
  });
});

describe("model comparison", () => {
  const candidates: CompareCandidate[] = [
    { modelId: "org/fast", mode: "hosted" },
    { modelId: "org/slow", mode: "hosted" },
    { modelId: "org/broken", mode: "hosted" },
  ];

  it("runs one prompt across every model and measures each latency", async () => {
    const report = await compareModels({
      prompt: "hello",
      candidates,
      run: async (candidate) => {
        if (candidate.modelId === "org/broken") return { status: "failed", model: candidate.modelId, error: "no token" };
        return { status: "completed", content: `reply from ${candidate.modelId}`, via: "test", model: candidate.modelId };
      },
    });
    expect(report.results).toHaveLength(3);
    for (const result of report.results) expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.ranked).toHaveLength(2);
    expect(report.results.find((r) => r.modelId === "org/broken")?.error).toBe("no token");
  });

  it("ranks the successful models fastest first", async () => {
    const report = await compareModels({
      prompt: "hello",
      candidates,
      run: async (candidate) => {
        if (candidate.modelId === "org/broken") return { status: "failed", model: candidate.modelId, error: "nope" };
        // Make the ordering unambiguous rather than relying on real timing.
        await new Promise((resolve) => setTimeout(resolve, candidate.modelId === "org/slow" ? 30 : 1));
        return { status: "completed", content: "ok", via: "test", model: candidate.modelId };
      },
    });
    expect(report.ranked[0]).toBe("org/fast");
  });

  it("does not fail the whole comparison when one model fails", async () => {
    const report = await compareModels({
      prompt: "hello",
      candidates,
      run: async (candidate) =>
        candidate.modelId === "org/broken"
          ? { status: "failed", model: candidate.modelId, error: "boom" }
          : { status: "completed", content: "ok", via: "test", model: candidate.modelId },
    });
    expect(report.results.filter((r) => r.status === "completed")).toHaveLength(2);
  });

  it("catches a thrown error and records it against that model", async () => {
    const report = await compareModels({
      prompt: "hello",
      candidates,
      run: async (candidate) => {
        if (candidate.modelId === "org/broken") throw new Error("network exploded");
        return { status: "completed", content: "ok", via: "test", model: candidate.modelId };
      },
    });
    expect(report.results.find((r) => r.modelId === "org/broken")?.error).toBe("network exploded");
  });

  it("says plainly that latency is not a benchmark", async () => {
    const report = await compareModels({ prompt: "x", candidates: candidates.slice(0, 2), run: async (c) => ({ status: "completed", content: "ok", via: "t", model: c.modelId }) });
    expect(report.note).toMatch(/not a benchmark/i);
  });

  it("caps the field at four models", async () => {
    const many: CompareCandidate[] = Array.from({ length: 6 }, (_, index) => ({ modelId: `org/m${index}`, mode: "hosted" as const }));
    const report = await compareModels({ prompt: "x", candidates: many, run: async (c) => ({ status: "completed", content: "ok", via: "t", model: c.modelId }) });
    expect(report.results).toHaveLength(4);
  });

  it("includes the system prompt when one is given", async () => {
    let seen: unknown[] = [];
    await compareModels({
      prompt: "hello",
      system: "be terse",
      candidates: candidates.slice(0, 2),
      run: async (_candidate, messages) => { seen = messages; return { status: "completed", content: "ok", via: "t", model: "x" }; },
    });
    expect(seen[0]).toEqual({ role: "system", content: "be terse" });
    expect(seen[1]).toEqual({ role: "user", content: "hello" });
  });
});
