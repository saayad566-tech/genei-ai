import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { liveness, readiness } from "./_core/ops";

/**
 * Production readiness.
 *
 * These exist because of a real defect: `/readyz` called `readiness()` with no argument,
 * threw "Cannot read properties of undefined (reading 'dataDir')", and reported
 * "not ready" for a reason that had nothing to do with readiness. A probe that fails
 * spuriously is worse than no probe, because an orchestrator will take a healthy instance
 * out of rotation and the cause will look like an outage.
 */

describe("liveness", () => {
  it("reports healthy and a real uptime", () => {
    const report = liveness();
    expect(report.state).toBe("healthy");
    expect(Number.isFinite(report.uptimeSeconds)).toBe(true);
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("carries no dependency checks, by design", () => {
    // Liveness answers "is the process alive". It deliberately has no checks field: a
    // failing dependency must NOT fail liveness, or an orchestrator would restart the
    // process instead of surfacing the dependency problem.
    const report = liveness();
    expect(report).toEqual({ state: "healthy", uptimeSeconds: expect.any(Number) });
    expect((report as Record<string, unknown>).checks).toBeUndefined();
  });
});

describe("readiness", () => {
  it("does not throw without a data directory — it reports not-ready instead", () => {
    // The exact defect: a missing argument threw "Cannot read properties of undefined".
    // A probe that throws is indistinguishable from a crashed process, so this must be a
    // verdict with a reason.
    const report = readiness();
    expect(report.state).toBe("unhealthy");
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.checks.every((c) => c.ok)).toBe(false);
    expect(report.checks[0].detail).toMatch(/data directory/i);
  });

  it("is ready when the data directory is writable and there is room", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-ready-"));
    const report = readiness({ dataDir: dir });
    expect(report.state).toBe("healthy");
    expect(report.checks.every((c) => c.ok)).toBe(true);
    expect(report.checks.some((c) => c.name === "data-directory" && c.ok)).toBe(true);
  });

  it("reports the real data directory it checked", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-ready-"));
    const report = readiness({ dataDir: dir });
    const check = report.checks.find((c) => c.name === "data-directory");
    expect(check?.detail).toContain(dir);
  });

  it("is NOT ready when the data directory cannot be written", () => {
    // A path under a file, not a directory, so mkdir must fail.
    const file = path.join(os.tmpdir(), `genei-not-a-dir-${Date.now()}`);
    fs.writeFileSync(file, "x");
    const report = readiness({ dataDir: path.join(file, "nested") });
    expect(report.state).not.toBe("healthy");
    expect(report.checks.some((c) => !c.ok)).toBe(true);
  });

  it("every check carries a name, a verdict and a detail", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-ready-"));
    const report = readiness({ dataDir: dir });
    for (const check of report.checks) {
      expect(typeof check.name).toBe("string");
      expect(check.name.length).toBeGreaterThan(0);
      expect(typeof check.ok).toBe("boolean");
      expect(typeof check.detail).toBe("string");
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });

  it("reports a real, parseable timestamp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-ready-"));
    const report = readiness({ dataDir: dir });
    expect(Number.isNaN(Date.parse(report.checkedAt))).toBe(false);
  });
});

describe("the readiness gate the endpoint applies", () => {
  it("a healthy report with every check passing is ready", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-ready-"));
    const report = readiness({ dataDir: dir });
    const ready = report.state === "healthy" && report.checks.every((c) => c.ok);
    expect(ready).toBe(true);
  });

  it("a report with any failing check is not ready", () => {
    const report = { state: "degraded" as const, checks: [{ name: "x", ok: false, detail: "no" }] };
    const ready = report.state === "healthy" && report.checks.every((c) => c.ok);
    expect(ready).toBe(false);
  });
});
