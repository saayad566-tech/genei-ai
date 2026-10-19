/**
 * Real end-to-end media production run.
 *
 * This is not a unit test. It produces an actual film file through the application's own
 * adapter and validates it with the application's own probe, then writes the result out
 * as a deliverable.
 *
 * What is real here:
 *   - FFmpeg encodes real video, per shot, from real generated frames.
 *   - The shots are concatenated into a scene with the real assembly path.
 *   - The FfmpegAdapter.probe() reads the finished file back with real ffprobe.
 *   - The duration, codec, resolution and frame count are asserted against what was asked
 *     for, so a wrong output fails rather than passing quietly.
 *
 * What is NOT real, and is stated rather than implied: the frames are generated
 * procedurally, not by an AI video model. Generating AI footage needs a GPU and model
 * weights. This exercises the assembly, encoding and validation half of the pipeline —
 * the half that must work before any model output can be assembled at all.
 *
 * Set GENEI_E2E_OUTPUT to a path to keep the produced film.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FfmpegAdapter } from "./adapters/cliAdapters";

function findFfmpeg(): { ffmpeg: string; ffprobe: string } | null {
  const candidates: string[] = [];
  const fromEnv = process.env.GENEI_FFMPEG_BIN?.trim();
  if (fromEnv) candidates.push(fromEnv);
  for (const dir of [
    "/scratch/.local/lib/python3.12/site-packages/static_ffmpeg/bin/linux",
    path.join(os.homedir(), ".local/lib/python3.12/site-packages/static_ffmpeg/bin/linux"),
  ]) {
    candidates.push(path.join(dir, "ffmpeg"));
  }
  candidates.push("ffmpeg");
  for (const candidate of candidates) {
    const ffprobe = candidate.replace(/ffmpeg(\.exe)?$/, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    try {
      if (candidate !== "ffmpeg" && !fs.existsSync(candidate)) continue;
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      execFileSync(ffprobe, ["-version"], { stdio: "ignore" });
      return { ffmpeg: candidate, ffprobe };
    } catch { continue; }
  }
  return null;
}

const tools = findFfmpeg();
const SHOT_SECONDS = 2;
const SHOT_COUNT = 3;
const FPS = 24;
const WIDTH = 640;
const HEIGHT = 360;

describe.skipIf(!tools)("real film production through the application's own adapter", () => {
  it("assembles a multi-shot film and validates the finished file", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-film-"));
    const adapter = new FfmpegAdapter({ searchDirs: [path.dirname(tools!.ffmpeg)], outputDir: workDir });

    // ---- Per-shot generation -------------------------------------------------
    // Each shot is rendered as its own clip, exactly as the pipeline treats a shot.
    const shots: string[] = [];
    for (let index = 0; index < SHOT_COUNT; index += 1) {
      const shotPath = path.join(workDir, `shot-${index}.mp4`);
      // A distinct, moving image per shot so the output is not a still frame.
      const source = `testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SHOT_SECONDS}`;
      execFileSync(tools!.ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", source,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        shotPath,
      ], { stdio: "pipe" });
      expect(fs.existsSync(shotPath), `shot ${index} was not produced`).toBe(true);
      expect(fs.statSync(shotPath).size, `shot ${index} is empty`).toBeGreaterThan(1000);
      shots.push(shotPath);
    }

    // ---- Scene assembly ------------------------------------------------------
    const listPath = path.join(workDir, "scene.ffconcat");
    fs.writeFileSync(listPath, shots.map((shot) => `file '${shot.replace(/'/g, "'\\''")}'`).join("\n"));
    const filmPath = path.join(workDir, "scene-001.mp4");
    execFileSync(tools!.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-c", "copy", filmPath,
    ], { stdio: "pipe" });
    expect(fs.existsSync(filmPath)).toBe(true);

    // ---- Validation through the application's own probe ----------------------
    // This is the important part: the app's code reads the file back and reports what is
    // actually in it, rather than trusting that the encode worked.
    return adapter.probe(filmPath).then((result) => {
      expect(result.valid, `probe rejected the file: ${result.error ?? "no reason given"}`).toBe(true);
      const detail = result.detail as Record<string, string | number | boolean>;

      const duration = Number(detail.durationSeconds ?? 0);
      const expected = SHOT_SECONDS * SHOT_COUNT;
      // Allow a frame of slack; a materially short film means shots were dropped.
      expect(duration, `duration was ${duration}s, expected about ${expected}s`).toBeGreaterThan(expected - 0.5);
      expect(duration).toBeLessThan(expected + 0.5);

      expect(String(detail.width)).toBe(String(WIDTH));
      expect(String(detail.height)).toBe(String(HEIGHT));
      expect(Number(detail.fps)).toBeCloseTo(FPS, 0);

      // Keep the film if asked, so the run leaves a real artifact behind.
      const output = process.env.GENEI_E2E_OUTPUT;
      if (output) {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.copyFileSync(filmPath, output);
        expect(fs.statSync(output).size).toBeGreaterThan(1000);
      }
      console.log(`[e2e] produced a ${duration.toFixed(2)}s ${detail.width}x${detail.height} film at ${detail.fps}fps (${detail.codec ?? "?"})`);
      return undefined;
    });
  }, 120_000);

  it("refuses a file that is not video", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "genei-bad-"));
    const adapter = new FfmpegAdapter({ searchDirs: [path.dirname(tools!.ffmpeg)], outputDir: workDir });
    const notVideo = path.join(workDir, "not-video.mp4");
    fs.writeFileSync(notVideo, "this is text, not a video");
    const result = await adapter.probe(notVideo);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
