import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectHardware, runSelfTest } from "./adapters/selfTest";
import { runtimeConfig } from "./adapters";

function findFfmpeg(): string | null {
  const candidates = [
    process.env.GENEI_FFMPEG_BIN?.trim(),
    "/scratch/.local/lib/python3.12/site-packages/static_ffmpeg/bin/linux/ffmpeg",
    path.join(os.homedir(), ".local/lib/python3.12/site-packages/static_ffmpeg/bin/linux/ffmpeg"),
    "ffmpeg",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      if (candidate !== "ffmpeg" && !fs.existsSync(candidate)) continue;
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

const ffmpeg = findFfmpeg();
if (ffmpeg) process.env.GENEI_FFMPEG_BIN = ffmpeg;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-selftest-"));

describe("hardware detection", () => {
  it("reports this machine's real, measured facts", async () => {
    const hardware = await detectHardware();
    expect(hardware.os).toBe(process.platform);
    expect(hardware.arch).toBe(process.arch);
    expect(hardware.cpuCount).toBeGreaterThan(0);
    expect(hardware.cpu.length).toBeGreaterThan(0);
    expect(hardware.ramGB).toBeGreaterThan(0);
    // CPU is always a real backend.
    expect(hardware.backends).toContain("cpu");
    // Every measured fact records how it was established.
    expect(hardware.sources.ramGB).toBeTruthy();
    expect(hardware.sources.cpu).toBeTruthy();
  });

  it("says unknown rather than assuming a GPU it cannot identify", async () => {
    const hardware = await detectHardware();
    if (hardware.gpu === "unknown") {
      expect(hardware.notes.join(" ")).toMatch(/no gpu could be identified/i);
      expect(hardware.vramGB).toBeNull();
    } else {
      // If one was found, it was found by a named tool.
      expect(hardware.sources.gpu).toBeTruthy();
    }
  });
});

describe("readiness self-test", () => {
  it("reports an honest verdict and never marks an unavailable step as passed", async () => {
    const config = runtimeConfig({ comfyUrl: "http://127.0.0.1:1", vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp(), mediaDir: tmp() });
    const report = await runSelfTest({ config, workDir: tmp() });

    expect(["ready", "degraded", "not_ready"]).toContain(report.verdict);
    expect(report.steps.length).toBeGreaterThanOrEqual(4);
    expect(report.hardware.os).toBe(process.platform);

    // Most tools are absent here, so the probe cannot be a pass. It must name which
    // adapters genuinely answered rather than claiming a blanket readiness.
    const adaptersStep = report.steps.find((step) => step.id === "adapters");
    expect(adaptersStep?.status).toBe("blocked");
    // Whichever it is — some adapters ready, or none — the detail must name the real
    // states rather than claiming a blanket readiness.
    expect(adaptersStep?.detail).toMatch(/of \d+ adapters are ready|no adapter is ready/i);

    // The reviewer endpoint is down, so it is blocked, not passed.
    expect(report.steps.find((step) => step.id === "reviewer")?.status).toBe("blocked");

    // The proof was not requested, so it is skipped rather than claimed.
    expect(report.steps.find((step) => step.id === "proof")?.status).toBe("skipped");

    expect(report.verdict).toBe("degraded");
    expect(report.summary).toMatch(/partly ready/i);
  }, 40_000);

  it.skipIf(!ffmpeg)("encodes and validates a real clip when FFmpeg is present", async () => {
    const config = runtimeConfig({ comfyUrl: "http://127.0.0.1:1", vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp(), mediaDir: tmp() });
    const report = await runSelfTest({ config, workDir: tmp() });

    const media = report.steps.find((step) => step.id === "media");
    expect(media?.status).toBe("passed");
    expect(media?.detail).toMatch(/encoded and validated/i);
    // The detail carries the real facts read back from the encoded file.
    expect(media?.detail).toMatch(/320×180|320x180/);
    expect(media?.detail).toMatch(/h264/);
  }, 60_000);

  it("reports the media step as skipped when FFmpeg is absent", async () => {
    const previous = process.env.GENEI_FFMPEG_BIN;
    process.env.GENEI_FFMPEG_BIN = path.join(tmp(), "no-such-ffmpeg");
    try {
      const config = runtimeConfig({ comfyUrl: "http://127.0.0.1:1", vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp(), mediaDir: tmp() });
      const report = await runSelfTest({ config, workDir: tmp() });
      const media = report.steps.find((step) => step.id === "media");
      // "skipped" with the reason, not a fabricated pass.
      expect(["skipped", "failed"]).toContain(media?.status);
      expect(media?.detail).toMatch(/ffmpeg is not available|not installed/i);
    } finally {
      if (previous === undefined) delete process.env.GENEI_FFMPEG_BIN;
      else process.env.GENEI_FFMPEG_BIN = previous;
    }
  }, 40_000);
});
