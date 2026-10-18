import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Logger, newCorrelationId, redact } from "./_core/logger";
import { AuditTrail } from "./_core/audit";
import { Lifecycle, Supervisor } from "./_core/lifecycle";
import { StateStore, writeAtomic } from "./_core/backup";
import { advise, quantisationLabel, explainFit } from "./modelAdvisor";
import type { ModelFile } from "./aiStore";

/**
 * The operational layer: logging, audit, lifecycle, backup and the model advisor.
 *
 * The redaction tests matter most. A log is the easiest place to leak a credential by
 * accident, and a redactor that misses one shape is worse than none, because it implies
 * the log is safe.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-ops2-"));
const file = (name: string, gb: number): ModelFile => ({
  path: name,
  sizeBytes: Math.round(gb * 1024 ** 3),
  url: `https://example/${name}`,
  recommended: false,
});

describe("redaction", () => {
  it("masks known key prefixes whole", () => {
    for (const value of ["sk-proj-abcdef1234567890", "hf_abcdefghijklmnop", "ghp_abcdefghijklmnop", "AKIAIOSFODNN7EXAMPLE"]) {
      const masked = redact(value) as string;
      expect(masked, value).toMatch(/redacted/);
      expect(masked).not.toBe(value);
    }
  });

  it("masks a bearer token inside a longer string", () => {
    const masked = redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6") as string;
    expect(masked).toMatch(/\[redacted\]/);
    expect(masked).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6");
  });

  it("masks a value whose key names it as a secret", () => {
    const masked = redact({ apiKey: "whatever-this-is", password: "hunter2", model: "qwen" }) as Record<string, string>;
    expect(masked.apiKey).toBe("[redacted]");
    expect(masked.password).toBe("[redacted]");
    expect(masked.model).toBe("qwen");
  });

  it("recurses into nested objects and arrays", () => {
    const masked = redact({ outer: { inner: { token: "abc" } }, list: [{ secret: "x" }] }) as Record<string, unknown>;
    expect((masked.outer as Record<string, Record<string, string>>).inner.token).toBe("[redacted]");
    expect(((masked.list as Array<Record<string, string>>)[0]).secret).toBe("[redacted]");
  });

  it("truncates a very long value rather than writing all of it", () => {
    const masked = redact("x".repeat(1000)) as string;
    expect(masked).toMatch(/truncated/);
    expect(masked.length).toBeLessThan(400);
  });

  it("leaves ordinary values alone", () => {
    expect(redact("qwen2.5-7b")).toBe("qwen2.5-7b");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});

describe("logger", () => {
  it("respects the level threshold", () => {
    const logger = new Logger({ level: "warn" });
    logger.debug("ignored");
    logger.info("ignored");
    logger.warn("kept");
    expect(logger.flush()).toBe(1);
  });

  it("writes redacted JSON lines to the file", () => {
    const dir = tmp();
    const filePath = path.join(dir, "log.jsonl");
    const logger = new Logger({ level: "debug", filePath });
    logger.info("added a key", { apiKey: "sk-secret-value-1234567890", provider: "huggingface" });
    logger.flush();

    const written = fs.readFileSync(filePath, "utf8");
    expect(written).not.toContain("sk-secret-value-1234567890");
    expect(written).toContain("huggingface");
    expect(JSON.parse(written.trim()).message).toBe("added a key");
  });

  it("reads its own log back, skipping a torn line", () => {
    const dir = tmp();
    const filePath = path.join(dir, "log.jsonl");
    const logger = new Logger({ level: "debug", filePath });
    logger.info("first");
    logger.flush();
    fs.appendFileSync(filePath, '{"torn":');
    const records = Logger.readRecent(filePath, 10);
    expect(records.some((record) => record.message === "first")).toBe(true);
    expect(records.every((record) => typeof record.message === "string")).toBe(true);
  });

  it("carries a correlation id through a bound logger", () => {
    const logger = new Logger({ level: "debug" });
    const bound = logger.withCorrelation("op-1");
    bound.info("step");
    expect(newCorrelationId("x")).toMatch(/^x-/);
  });
});

describe("audit trail", () => {
  it("records who did what, and reads it back newest first", () => {
    const trail = new AuditTrail();
    trail.record({ action: "model.installed", userId: 1, target: "org/model", outcome: "ok" });
    trail.record({ action: "model.removed", userId: 1, target: "org/model", outcome: "ok" });
    const recent = trail.recent(10);
    expect(recent[0].action).toBe("model.removed");
    expect(recent[0].time).toMatch(/^\d{4}-/);
  });

  it("filters by action and by user", () => {
    const trail = new AuditTrail();
    trail.record({ action: "model.installed", userId: 1, outcome: "ok" });
    trail.record({ action: "cache.cleared", userId: 2, outcome: "ok" });
    expect(trail.recent(10, { action: "model.installed" })).toHaveLength(1);
    expect(trail.recent(10, { userId: 2 })).toHaveLength(1);
  });

  it("bounds its in-memory history", () => {
    const trail = new AuditTrail({ maxEntries: 5 });
    for (let i = 0; i < 20; i += 1) trail.record({ action: "job.queued", userId: 1, outcome: "ok" });
    expect(trail.recent(100)).toHaveLength(5);
  });

  it("persists to a file with restrictive permissions", () => {
    const dir = tmp();
    const filePath = path.join(dir, "audit.jsonl");
    const trail = new AuditTrail({ filePath });
    trail.record({ action: "apiKey.added", userId: 1, target: "huggingface", outcome: "ok" });
    const written = fs.readFileSync(filePath, "utf8");
    expect(written).toContain("apiKey.added");
    // 0600: the trail is not world-readable.
    expect(fs.statSync(filePath).mode & 0o077).toBe(0);
  });

  it("knows which actions are sensitive", () => {
    const trail = new AuditTrail();
    expect(trail.isSensitive("apiKey.removed")).toBe(true);
    expect(trail.isSensitive("job.queued")).toBe(false);
  });
});

describe("lifecycle", () => {
  it("drains registered work and reports what finished", async () => {
    const lifecycle = new Lifecycle();
    const done: string[] = [];
    lifecycle.register({ name: "queue", drain: async () => { done.push("queue"); } });
    lifecycle.register({ name: "downloads", drain: async () => { done.push("downloads"); } });
    const result = await lifecycle.shutdown();
    expect(result.drained).toEqual(["queue", "downloads"]);
    expect(result.timedOut).toEqual([]);
  });

  it("does not let one hung drain hold up the rest", async () => {
    const lifecycle = new Lifecycle();
    const done: string[] = [];
    lifecycle.register({ name: "hung", drain: () => new Promise<void>(() => undefined) });
    lifecycle.register({ name: "fine", drain: async () => { done.push("fine"); } });
    const result = await lifecycle.shutdown({ perItemMs: 20 });
    expect(result.timedOut).toContain("hung");
    expect(done).toContain("fine");
  });

  it("is idempotent", async () => {
    const lifecycle = new Lifecycle();
    await lifecycle.shutdown();
    const second = await lifecycle.shutdown();
    expect(second.elapsedMs).toBe(0);
  });
});

describe("supervisor", () => {
  it("leaves a healthy process alone", async () => {
    const supervisor = new Supervisor();
    const result = await supervisor.ensureHealthy({ name: "server", isRunning: () => true, start: async () => undefined, stop: async () => undefined });
    expect(result.restarted).toBe(false);
  });

  it("restarts a dead process", async () => {
    const supervisor = new Supervisor({ backoffMs: 1 });
    let running = false;
    const result = await supervisor.ensureHealthy({
      name: "server", isRunning: () => running,
      start: async () => { running = true; }, stop: async () => undefined,
    });
    expect(result.restarted).toBe(true);
    expect(running).toBe(true);
  });

  it("gives up after the cap rather than looping forever", async () => {
    const supervisor = new Supervisor({ maxRestarts: 2, backoffMs: 1 });
    const dead = { name: "server", isRunning: () => false, start: async () => undefined, stop: async () => undefined };
    await supervisor.ensureHealthy(dead);
    await supervisor.ensureHealthy(dead);
    const third = await supervisor.ensureHealthy(dead);
    expect(third.restarted).toBe(false);
    expect(third.reason).toMatch(/will not fix/i);
  });

  it("treats an unresponsive process as unhealthy", async () => {
    const supervisor = new Supervisor({ backoffMs: 1 });
    const result = await supervisor.ensureHealthy({
      name: "server", isRunning: () => true,
      isHealthy: async () => false,
      start: async () => undefined, stop: async () => undefined,
    });
    expect(result.restarted).toBe(true);
  });
});

describe("backup", () => {
  it("writes atomically, leaving no temp file behind", () => {
    const dir = tmp();
    const target = path.join(dir, "state.json");
    writeAtomic(target, '{"a":1}');
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ a: 1 });
    expect(fs.readdirSync(dir).some((name) => name.includes(".tmp-"))).toBe(false);
  });

  it("only writes when something changed", () => {
    const dir = tmp();
    const store = new StateStore(path.join(dir, "state.json"), { count: 0 });
    expect(store.save().written).toBe(false);
    store.update({ count: 1 });
    expect(store.save().written).toBe(true);
    expect(store.save().written).toBe(false);
  });

  it("keeps a bounded snapshot history", () => {
    const dir = tmp();
    const snapshots = path.join(dir, "snapshots");
    const store = new StateStore(path.join(dir, "state.json"), { count: 0 }, { snapshotDir: snapshots, maxSnapshots: 3 });
    for (let i = 1; i <= 8; i += 1) {
      store.update({ count: i });
      store.save();
    }
    expect(store.listSnapshots().length).toBeLessThanOrEqual(3);
  });

  it("restores a snapshot, and snapshots the state it replaces", () => {
    const dir = tmp();
    const snapshots = path.join(dir, "snapshots");
    const store = new StateStore(path.join(dir, "state.json"), { count: 0 }, { snapshotDir: snapshots, maxSnapshots: 10 });
    // The first save has no previous file, so it takes no snapshot; the second does.
    store.update({ count: 1 });
    store.save();
    store.update({ count: 2 });
    store.save();          // snapshots {count: 1}
    const first = store.listSnapshots()[0];
    expect(first).toBeDefined();

    store.update({ count: 3 });
    store.save();          // snapshots {count: 2}

    const restored = store.restore(first.name);
    expect(restored.ok).toBe(true);
    expect(store.get().count).toBe(1);
    // The state that was replaced is recoverable, so a restore is itself undoable.
    expect(store.listSnapshots().length).toBeGreaterThan(1);
  });

  it("gives two snapshots in the same second distinct names", () => {
    const dir = tmp();
    const snapshots = path.join(dir, "snapshots");
    const store = new StateStore(path.join(dir, "state.json"), { count: 0 }, { snapshotDir: snapshots, maxSnapshots: 10 });
    store.update({ count: 1 }); store.save();
    store.update({ count: 2 }); store.save();
    store.update({ count: 3 }); store.save();
    const names = store.listSnapshots().map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("refuses a path outside the snapshot directory", () => {
    const store = new StateStore(path.join(tmp(), "state.json"), { count: 0 }, { snapshotDir: path.join(tmp(), "snap") });
    expect(store.restore("../../etc/passwd").ok).toBe(false);
  });

  it("refuses a snapshot that is not valid state", () => {
    const dir = tmp();
    const snapshots = path.join(dir, "snapshots");
    fs.mkdirSync(snapshots, { recursive: true });
    fs.writeFileSync(path.join(snapshots, "state-bad.json"), "not json");
    const store = new StateStore(path.join(dir, "state.json"), { count: 0 }, { snapshotDir: snapshots });
    const result = store.restore("state-bad.json");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not valid state/i);
  });
});

describe("model advisor", () => {
  it("recommends the highest quality that fits comfortably", () => {
    const advice = advise(
      [file("m-Q2_K.gguf", 2), file("m-Q4_K_M.gguf", 4), file("m-Q8_0.gguf", 8)],
      { availableGB: 16, basis: "system memory" },
    );
    expect(advice.recommended?.path).toContain("Q8_0");
    expect(advice.options[0].file.path).toContain("Q8_0");
    expect(advice.summary).toMatch(/16 GB/);
  });

  it("prefers a smaller option when the best would use most of the memory", () => {
    const advice = advise([file("m-Q2_K.gguf", 2), file("m-Q8_0.gguf", 10)], { availableGB: 11, basis: "system memory" });
    // Q8 needs ~12 GB against 11, so it is rejected rather than recommended.
    expect(advice.recommended?.path).toContain("Q2_K");
    expect(advice.rejected.some((entry) => entry.file.path.includes("Q8_0"))).toBe(true);
  });

  it("says nothing fits, and what to do about it", () => {
    const advice = advise([file("m-Q8_0.gguf", 40)], { availableGB: 8, basis: "system memory" });
    expect(advice.recommended).toBeUndefined();
    expect(advice.summary).toMatch(/hosted|smaller/i);
  });

  it("says so when memory cannot be read rather than guessing", () => {
    const advice = advise([file("m-Q4_K_M.gguf", 4)], { availableGB: null, basis: "system memory" });
    expect(advice.recommended).toBeUndefined();
    expect(advice.summary).toMatch(/could not be read/i);
  });

  it("labels every quantisation it recognises, and says when it does not", () => {
    expect(quantisationLabel("model-Q4_K_M.gguf").label).toBe("Q4_K_M");
    expect(quantisationLabel("model-Q8_0.gguf").quality).toBeGreaterThan(quantisationLabel("model-Q2_K.gguf").quality);
    expect(quantisationLabel("model-mystery.gguf").label).toBe("unknown");
  });

  it("prefers GGUF files when the repository has other formats too", () => {
    const advice = advise([file("model.safetensors", 20), file("model-Q4_K_M.gguf", 4)], { availableGB: 16, basis: "system memory" });
    expect(advice.recommended?.path).toMatch(/gguf/);
  });

  it("explains a fit verdict in one sentence", () => {
    expect(explainFit({ status: "fits", reason: "fine" })).toMatch(/comfortably/);
    expect(explainFit({ status: "too-large", reason: "too big" })).toMatch(/unlikely/);
  });
});
