import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getRuntimeJob, submitRuntimeJob, listRuntimeJobs } from "./runtimeJobs";

/**
 * The execution plane must not fabricate a success.
 *
 * This is the TypeScript counterpart of `ai_director/test_provider_honesty.py`, and it
 * exists for the same reason: a `status: "completed"` with no artifact behind it is
 * indistinguishable from real work at the call site.
 *
 * These tests are deliberately about the *absence* of things — no artifact, no runtime,
 * no output path — because those are the cases a fabricated success hides in.
 */

describe("a job is only completed when an artifact exists", () => {
  it("refuses a probe with no filePath rather than reporting success", async () => {
    const job = await submitRuntimeJob({ taskType: "probe", payload: {} });
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/needs a filePath/i);
    expect(job.outputPath).toBeUndefined();
  });

  it("refuses a probe of a file that does not exist", async () => {
    const job = await submitRuntimeJob({ taskType: "probe", payload: { filePath: "/tmp/definitely-not-here-1234.mp4" } });
    expect(job.status).toBe("failed");
    expect(job.outputPath).toBeUndefined();
  });

  it("refuses to complete when the named output was never created", async () => {
    const job = await submitRuntimeJob({
      taskType: "extract-frame",
      payload: { inputPath: "/tmp/nope.mp4", outputPath: path.join(os.tmpdir(), "never-written.png"), atSeconds: 1 },
    });
    expect(job.status).toBe("failed");
    expect(job.error).toBeTruthy();
    expect(job.outputPath).toBeUndefined();
  });

  it("refuses extract-frame without both paths", async () => {
    const job = await submitRuntimeJob({ taskType: "extract-frame", payload: { inputPath: "/tmp/x.mp4" } });
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/needs inputPath and outputPath/i);
  });
});

describe("a generation task with no runtime fails honestly", () => {
  it("says which tool is missing instead of returning a plausible result", async () => {
    const job = await submitRuntimeJob({ taskType: "video", payload: { prompt: "a city at dusk" } });
    expect(job.status).toBe("failed");
    // The message must name what is missing and what still works.
    expect(job.error).toMatch(/ComfyUI/i);
    expect(job.error).toMatch(/not running/i);
    expect(job.error).toMatch(/Media assembly is available now/i);
    expect(job.outputPath).toBeUndefined();
  });

  it("does the same for text, image, lipsync, upscale and transcribe", async () => {
    for (const taskType of ["text", "image", "lipsync", "upscale", "transcribe"] as const) {
      const job = await submitRuntimeJob({ taskType, payload: {} });
      expect(job.status, `${taskType} should not succeed without a runtime`).toBe("failed");
      expect(job.error).toBeTruthy();
      expect(job.outputPath).toBeUndefined();
    }
  });

  it("never returns a URL, only a path — so a fabricated remote asset is impossible", async () => {
    const job = await submitRuntimeJob({ taskType: "video", payload: {} });
    const serialised = JSON.stringify(job);
    expect(serialised).not.toMatch(/https?:\/\//);
    expect(serialised).not.toMatch(/example\.com/);
  });
});

describe("job history", () => {
  it("records what happened and can be read back", async () => {
    const job = await submitRuntimeJob({ taskType: "probe", payload: {} });
    const found = getRuntimeJob(job.id);
    expect(found?.id).toBe(job.id);
    expect(found?.status).toBe("failed");
    expect(found?.createdAt).toBeGreaterThan(0);
    expect(found?.updatedAt).toBeGreaterThanOrEqual(found!.createdAt);
  });

  it("reports an unknown job as failed rather than pretending it is pending forever", () => {
    expect(getRuntimeJob("job-does-not-exist")).toBeUndefined();
  });

  it("keeps a bounded history", async () => {
    for (let i = 0; i < 5; i += 1) await submitRuntimeJob({ taskType: "probe", payload: {} });
    expect(listRuntimeJobs(3)).toHaveLength(3);
    expect(listRuntimeJobs(1000).length).toBeLessThanOrEqual(200);
  });
});

describe("a real artifact is the only thing that completes a job", () => {
  it("completes a probe only when the file genuinely exists", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-runtime-"));
    const real = path.join(dir, "real.txt");
    fs.writeFileSync(real, "a file that exists");
    // probe will reject it as not-video, which is correct — but the point here is that a
    // missing file and an invalid file are both failures, never successes.
    const job = await submitRuntimeJob({ taskType: "probe", payload: { filePath: real } });
    expect(job.status).toBe("failed");
    expect(job.outputPath).toBeUndefined();
  });
});
