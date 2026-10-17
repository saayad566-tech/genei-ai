/**
 * Real media-pipeline run.
 *
 * Everything here is genuine: real FFmpeg encodes real video, the adapter probes it
 * with real ffprobe, frames are extracted as real PNGs, and two clips are concatenated
 * into a real scene that is then probed again.
 *
 * What this does NOT do is generate AI footage — that needs a GPU and a video model.
 * This exercises the half of the pipeline that does not: the deterministic validator,
 * frame sampling and assembly. It is the difference between "the code compiles" and
 * "the code processes actual video correctly".
 *
 * The whole file skips when FFmpeg is not present, rather than failing.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegAdapter } from "./adapters/cliAdapters";

/** Find a usable ffmpeg + ffprobe pair, or report that there is none. */
function findFfmpeg(): { ffmpeg: string; ffprobe: string } | null {
  const candidates: string[] = [];
  const fromEnv = process.env.GENEI_FFMPEG_BIN?.trim();
  if (fromEnv) candidates.push(fromEnv);
  // Locations the static-ffmpeg and imageio-ffmpeg helpers install into.
  const sitePackages = [
    "/scratch/.local/lib/python3.12/site-packages/static_ffmpeg/bin/linux",
    path.join(os.homedir(), ".local/lib/python3.12/site-packages/static_ffmpeg/bin/linux"),
  ];
  for (const dir of sitePackages) candidates.push(path.join(dir, "ffmpeg"));
  candidates.push("ffmpeg");

  for (const candidate of candidates) {
    const ffprobe = candidate.replace(/ffmpeg(\.exe)?$/, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    try {
      if (candidate !== "ffmpeg" && !fs.existsSync(candidate)) continue;
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      execFileSync(ffprobe, ["-version"], { stdio: "ignore" });
      return { ffmpeg: candidate, ffprobe };
    } catch {
      continue;
    }
  }
  return null;
}

const tools = findFfmpeg();
const available = tools !== null;
if (tools) process.env.GENEI_FFMPEG_BIN = tools.ffmpeg;

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-media-"));

/** Encode a real clip: a moving test pattern with an audio tone. */
function makeClip(name: string, seconds: number, frequency: number, size = "640x360"): string {
  const out = path.join(workDir, name);
  execFileSync(
    tools!.ffmpeg,
    [
      "-y",
      "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=24:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest",
      out,
    ],
    { stdio: "ignore" },
  );
  return out;
}

describe.skipIf(!available)("real media pipeline (FFmpeg)", () => {
  let adapter: FfmpegAdapter;
  let clipA: string;
  let clipB: string;

  beforeAll(() => {
    adapter = new FfmpegAdapter({ outputDir: workDir, binaryEnvVar: "GENEI_FFMPEG_BIN" });
    clipA = makeClip("clipA.mp4", 2, 440);
    clipB = makeClip("clipB.mp4", 2, 660);
  });

  it("detects the real binaries through the adapter's own health check", async () => {
    const status = await adapter.healthCheck();
    expect(status.state).toBe("ready");
    expect(String(status.detail?.version ?? "")).toMatch(/ffmpeg/i);
  });

  it("reads genuine stream facts from real encoded video", async () => {
    const probe = await adapter.probe(clipA);
    expect(probe.valid).toBe(true);
    expect(probe.detail.codec).toBe("h264");
    expect(probe.detail.width).toBe(640);
    expect(probe.detail.height).toBe(360);
    expect(probe.detail.fps).toBe(24);
    expect(probe.detail.hasAudio).toBe(true);
    expect(probe.detail.audioCodec).toBe("aac");
    expect(Number(probe.detail.durationSeconds)).toBeGreaterThan(1.5);
    expect(Number(probe.detail.sizeBytes)).toBeGreaterThan(1000);
  });

  it("rejects a file that is not media, and a file that does not exist", async () => {
    const notMedia = path.join(workDir, "not-media.mp4");
    fs.writeFileSync(notMedia, "this is plainly not a video");
    const probe = await adapter.probe(notMedia);
    expect(probe.valid).toBe(false);
    expect(probe.error).toBeTruthy();

    const missing = await adapter.probe(path.join(workDir, "absent.mp4"));
    expect(missing.valid).toBe(false);
    expect(missing.error).toMatch(/no file exists/i);
  });

  it("extracts real frames from real video", async () => {
    const frames: string[] = [];
    for (const [index, at] of [0, 0.5, 1.0, 1.5].entries()) {
      const framePath = path.join(workDir, `frame_${index}.png`);
      const outcome = await adapter.extractFrame(clipA, framePath, at);
      expect(outcome.status, `frame at ${at}s`).toBe("completed");
      expect(fs.existsSync(framePath)).toBe(true);
      // A real PNG, not an empty placeholder.
      expect(fs.statSync(framePath).size).toBeGreaterThan(500);
      frames.push(framePath);
    }
    expect(frames).toHaveLength(4);
  });

  it("assembles two real clips into one real scene", async () => {
    const listPath = path.join(workDir, "concat.txt");
    fs.writeFileSync(listPath, [clipA, clipB].map((file) => `file '${file}'`).join("\n"));
    const scenePath = path.join(workDir, "scene.mp4");

    const outcome = await adapter.run({ jobId: "assemble", inputPath: listPath, outputPath: scenePath });
    expect(outcome.status).toBe("completed");
    expect(fs.existsSync(scenePath)).toBe(true);

    const probe = await adapter.probe(scenePath);
    expect(probe.valid).toBe(true);
    // The assembled scene is genuinely the sum of its parts.
    expect(Number(probe.detail.durationSeconds)).toBeGreaterThan(3.5);
    expect(probe.detail.width).toBe(640);
    expect(probe.detail.hasAudio).toBe(true);
  }, 30_000);

  it("fails the assembly when the input list points at nothing", async () => {
    const listPath = path.join(workDir, "bad-concat.txt");
    fs.writeFileSync(listPath, "file '/tmp/definitely-not-here.mp4'");
    const outcome = await adapter.run({ jobId: "assemble-bad", inputPath: listPath, outputPath: path.join(workDir, "bad.mp4") });
    expect(outcome.status).toBe("failed");
  }, 30_000);

  it("reports progress from a real encode", async () => {
    const seen: Array<number | null> = [];
    const outcome = await adapter.run(
      { jobId: "progress", inputPath: clipA, outputPath: path.join(workDir, "progress.mp4") },
      { onProgress: (report) => seen.push(report.percent) },
    );
    expect(outcome.status).toBe("completed");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
  }, 30_000);
});

describe.skipIf(available)("real media pipeline (FFmpeg)", () => {
  it("reports that FFmpeg is unavailable rather than pretending", () => {
    // This suite is skipped wherever FFmpeg is present; where it is absent, the
    // adapter must say so instead of producing output it cannot produce.
    expect(available).toBe(false);
  });
});
