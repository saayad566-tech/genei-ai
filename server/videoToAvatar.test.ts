import { describe, expect, it, beforeAll } from "vitest";
import { promises as fs, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  analyseVideo,
  analyseVideoToPlan,
  assembleScenes,
  buildAvatarProfile,
  extractAnalysisFrames,
  LikenessConsentError,
  parseAnalysis,
  planOriginalVideo,
  probeVideo,
  requireConsent,
  resolveFfmpegPair,
  type ConsentRecord,
  type SubjectDescription,
} from "./videoToAvatar";

/**
 * Video-to-avatar.
 *
 * The probe and extraction tests run against a real 12 MB video with real ffmpeg, because
 * that is the only way to know the ffprobe JSON parsing and the frame sampling actually
 * work. The analysis tests use an injected fetch so the parsing and the honest-failure
 * paths are deterministic.
 */

const REAL_VIDEO = "/scratch/input/VID_20261017_102807.mp4";
const FFMPEG_DIR = "/scratch/.local/lib/python3.12/site-packages/static_ffmpeg/bin/linux";

const CONSENT: ConsentRecord = {
  affirmed: true,
  affirmedAt: new Date().toISOString(),
  basis: "it is me",
};

const ANALYSIS: SubjectDescription = {
  description: "A person walking outdoors in daylight, facing the camera.",
  distinguishing: ["short dark hair", "thin-framed glasses"],
  wardrobe: ["dark jacket", "light shirt"],
  setting: ["a paved path", "trees in the background"],
  visualStyle: ["natural daylight", "cool palette", "handheld"],
  motion: ["walking toward camera"],
  mood: "calm",
  shotCount: 3,
  pacing: "measured",
};

const VLM_REPLY = JSON.stringify(ANALYSIS);

function fakeVlm(content = VLM_REPLY, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

let FRAME: string;

/**
 * Whether a working ffmpeg/ffprobe pair exists — resolved SYNCHRONOUSLY at module load.
 *
 * `it.skipIf(x)` is evaluated when the test is defined, during module collection, which is
 * before any `beforeAll` runs. A flag set in `beforeAll` is therefore always false at that
 * point, and the guard silently skipped every real-ffmpeg test instead of running them.
 */
const ffmpegAvailable: boolean = (() => {
  try {
    const configured = process.env.GENEI_FFMPEG_BIN?.trim();
    const candidate = configured || path.join(FFMPEG_DIR, "ffmpeg");
    if (!configured && !existsSync(candidate)) return false;
    process.env.GENEI_FFMPEG_BIN = candidate;
    const pair = resolveFfmpegPair();
    execFileSync(pair.ffmpeg, ["-version"], { stdio: "ignore" });
    execFileSync(pair.ffprobe, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  // Point the module at the static ffmpeg build if it is not already on PATH.
  if (!process.env.GENEI_FFMPEG_BIN) {
    const candidate = path.join(FFMPEG_DIR, "ffmpeg");
    const exists = await fs.stat(candidate).then(() => true).catch(() => false);
    if (exists) process.env.GENEI_FFMPEG_BIN = candidate;
  }

  // A real 1x1 JPEG, so the analysis tests exercise the actual data-URL path.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "v2a-frame-"));
  FRAME = path.join(dir, "frame.jpg");
  await fs.writeFile(
    FRAME,
    Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
      "base64",
    ),
  );
});

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

describe("likeness consent", () => {
  it("refuses to proceed with no consent record", () => {
    expect(() => requireConsent(undefined)).toThrow(LikenessConsentError);
  });

  it("refuses when consent was not affirmed", () => {
    expect(() => requireConsent({ affirmed: false, affirmedAt: "", basis: "x" })).toThrow(/right to use this person's likeness/i);
  });

  it("refuses when no basis is stated", () => {
    expect(() => requireConsent({ affirmed: true, affirmedAt: "", basis: "  " })).toThrow(/state the basis/i);
  });

  it("accepts an affirmed record with a basis", () => {
    expect(requireConsent(CONSENT)).toBe(CONSENT);
  });

  it("blocks the whole pipeline before touching the file", async () => {
    // No consent means we should not even probe a path that does not exist.
    await expect(analyseVideoToPlan("/nonexistent.mp4", undefined)).rejects.toThrow(LikenessConsentError);
  });
});

/* ------------------------------------------------------------------ *
 * Real ffprobe
 * ------------------------------------------------------------------ */

describe("probe — real ffprobe on a real video", () => {
  it("resolves an ffprobe next to the configured ffmpeg", () => {
    const pair = resolveFfmpegPair();
    expect(pair.ffmpeg).toBeTruthy();
    expect(pair.ffprobe).toMatch(/ffprobe(\.exe)?$/);
  });

  it.skipIf(!ffmpegAvailable)("reads the real duration, resolution and codec", { timeout: 30_000 }, async () => {
    const probe = await probeVideo(REAL_VIDEO);
    expect(probe.durationSeconds).toBeGreaterThan(0);
    expect(probe.width).toBeGreaterThan(0);
    expect(probe.height).toBeGreaterThan(0);
    expect(probe.codec).toBeTruthy();
    expect(probe.sizeBytes).toBeGreaterThan(1_000_000);
  });

  it("rejects a missing file with a clear message", async () => {
    await expect(probeVideo("/definitely/not/here.mp4")).rejects.toThrow(/No video file/i);
  });

  it.skipIf(!ffmpegAvailable)("rejects a file that is not a video", async () => {
    const notVideo = path.join(os.tmpdir(), `not-a-video-${Date.now()}.mp4`);
    await fs.writeFile(notVideo, "this is plain text, not a video");
    await expect(probeVideo(notVideo)).rejects.toThrow(/ffprobe could not read|no video stream/i);
  });
});

/* ------------------------------------------------------------------ *
 * Real ffmpeg frame extraction
 * ------------------------------------------------------------------ */

describe("extract — real ffmpeg frames", () => {
  it.skipIf(!ffmpegAvailable)("produces real, non-empty JPEG frames", { timeout: 60_000 }, async () => {
    const probe = await probeVideo(REAL_VIDEO);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "v2a-test-"));
    const frames = await extractAnalysisFrames(REAL_VIDEO, probe, 4, dir);

    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      const stat = await fs.stat(frame);
      expect(stat.size).toBeGreaterThan(1000); // a real JPEG, not an empty file
      const head = await fs.readFile(frame);
      expect(head[0]).toBe(0xff); // JPEG SOI
      expect(head[1]).toBe(0xd8);
    }
  });

  it("refuses a zero-duration probe instead of producing nothing silently", async () => {
    await expect(
      extractAnalysisFrames(REAL_VIDEO, { durationSeconds: 0, width: 1, height: 1, fps: 1, codec: "h264", hasAudio: false, sizeBytes: 1 }, 2),
    ).rejects.toThrow(/zero duration/i);
  });
});

/* ------------------------------------------------------------------ *
 * Analysis — honest failure and real parsing
 * ------------------------------------------------------------------ */

describe("analyse", () => {
  it("is unavailable, with an actionable reason, when no vision model is configured", async () => {
    const result = await analyseVideo([FRAME], null);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/GENEI_VLM_URL/);
      expect(result.reason).toMatch(/Nothing is guessed/i);
    }
  });

  it("is unavailable when the model cannot be reached", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await analyseVideo([FRAME], { baseUrl: "http://127.0.0.1:1/v1", model: "m" }, failing);
    expect(result.status).toBe("unavailable");
  });

  it("is unavailable on a non-200 response, naming the status", async () => {
    const result = await analyseVideo([FRAME], { baseUrl: "http://x/v1", model: "m" }, fakeVlm("nope", 404));
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/404/);
  });

  it("is unavailable when the model replies with prose instead of JSON", async () => {
    const result = await analyseVideo([FRAME], { baseUrl: "http://x/v1", model: "m" }, fakeVlm("I think it is a person."));
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/not the requested JSON/i);
  });

  it("parses a real reply, tolerating a code fence", async () => {
    const fenced = "```json\n" + VLM_REPLY + "\n```";
    const result = await analyseVideo([FRAME], { baseUrl: "http://x/v1", model: "m" }, fakeVlm(fenced));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.analysis.description).toContain("person");
      expect(result.analysis.wardrobe).toContain("dark jacket");
      expect(result.model).toBe("m");
    }
  });

  it("parses a reply with prose around the JSON", async () => {
    const noisy = "Here is my analysis:\n" + VLM_REPLY + "\nHope that helps.";
    expect(parseAnalysis(noisy)?.mood).toBe("calm");
  });

  it("is unavailable when no frame file can be read, instead of throwing", async () => {
    // A frame can vanish between extraction and analysis; that must be a verdict, not a crash.
    const result = await analyseVideo(["/tmp/definitely-gone-xyz.jpg"], { baseUrl: "http://x/v1", model: "m" }, fakeVlm());
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/could be read/i);
  });

  it("returns null rather than a partial object when the description is missing", () => {
    expect(parseAnalysis(JSON.stringify({ wardrobe: ["a coat"] }))).toBeNull();
  });

  it("defaults shotCount to 1 rather than NaN when the model sends junk", () => {
    const parsed = parseAnalysis(JSON.stringify({ description: "a person", shotCount: "many" }));
    expect(parsed?.shotCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Avatar
 * ------------------------------------------------------------------ */

describe("avatar profile", () => {
  it("builds a consistency prompt carrying the distinguishing detail and wardrobe", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "test-vlm", 8);
    expect(avatar.consistencyPrompt).toContain("short dark hair");
    expect(avatar.consistencyPrompt).toContain("dark jacket");
    expect(avatar.consistencyPrompt).toMatch(/Always identical/i);
    expect(avatar.derivedFrom.framesAnalysed).toBe(8);
  });

  it("is deterministic for the same analysis", () => {
    const a = buildAvatarProfile(ANALYSIS, "m", 8);
    const b = buildAvatarProfile(ANALYSIS, "m", 8);
    expect(a.consistencyPrompt).toBe(b.consistencyPrompt);
  });

  it("still produces a usable prompt when the model gave no lists", () => {
    const sparse: SubjectDescription = { ...ANALYSIS, distinguishing: [], wardrobe: [] };
    const avatar = buildAvatarProfile(sparse, "m", 4);
    expect(avatar.distinguishing.length).toBeGreaterThan(0);
    expect(avatar.consistencyPrompt).toMatch(/Always identical/i);
  });
});

/* ------------------------------------------------------------------ *
 * Plan
 * ------------------------------------------------------------------ */

describe("original plan", () => {
  it("produces a multi-scene plan with a real total duration", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "m", 8);
    const plan = planOriginalVideo(avatar, ANALYSIS);
    expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
    expect(plan.totalDurationSeconds).toBe(plan.scenes.reduce((s, x) => s + x.durationSeconds, 0));
    expect(plan.totalDurationSeconds).toBeGreaterThan(0);
  });

  it("carries the avatar's consistency prompt into every scene", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "m", 8);
    const plan = planOriginalVideo(avatar, ANALYSIS);
    for (const scene of plan.scenes) {
      expect(scene.prompt).toContain(avatar.consistencyPrompt);
      expect(scene.prompt).toMatch(/no distortion/i);
    }
  });

  it("states plainly that the output is original, not a copy", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "m", 8);
    const plan = planOriginalVideo(avatar, ANALYSIS);
    expect(plan.originalityNote).toMatch(/newly written/i);
    expect(plan.originalityNote).toMatch(/not a copy/i);
  });

  it("numbers scenes from 1 without gaps", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "m", 8);
    const plan = planOriginalVideo(avatar, ANALYSIS);
    expect(plan.scenes.map((s) => s.index)).toEqual(plan.scenes.map((_, i) => i + 1));
  });
});

/* ------------------------------------------------------------------ *
 * End to end
 * ------------------------------------------------------------------ */

describe("pipeline", () => {
  it.skipIf(!ffmpegAvailable)("reaches a plan with a working vision model on the real video", { timeout: 60_000 }, async () => {
    const result = await analyseVideoToPlan(REAL_VIDEO, CONSENT, {
      frameCount: 3,
      config: { baseUrl: "http://x/v1", model: "test-vlm" },
      fetchImpl: fakeVlm(),
    });
    expect(result.status).toBe("planned");
    if (result.status === "planned") {
      expect(result.probe.durationSeconds).toBeGreaterThan(0);
      expect(result.avatar.consistencyPrompt).toBeTruthy();
      expect(result.plan.scenes.length).toBeGreaterThan(0);
      expect(result.model).toBe("test-vlm");
    }
  });

  it.skipIf(!ffmpegAvailable)("stops at 'analyse' and says why when no vision model is configured", { timeout: 60_000 }, async () => {
    const result = await analyseVideoToPlan(REAL_VIDEO, CONSENT, {
      frameCount: 2,
      config: null,
      fetchImpl: fakeVlm(),
    });
    expect(result.status).toBe("stopped");
    if (result.status === "stopped") {
      expect(result.stage).toBe("analyse");
      expect(result.reason).toMatch(/vision model/i);
      // It still reports what it did manage to read.
      expect(result.probe?.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("stops at 'probe' for a file that is not a video", async () => {
    const bad = path.join(os.tmpdir(), `bad-${Date.now()}.mp4`);
    await fs.writeFile(bad, "not a video");
    const result = await analyseVideoToPlan(bad, CONSENT, { config: null });
    expect(result.status).toBe("stopped");
    if (result.status === "stopped") expect(result.stage).toBe("probe");
  });
});

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

describe("assemble — real ffmpeg concat", () => {
  it.skipIf(!ffmpegAvailable)("concatenates real clips and reports a real duration", { timeout: 60_000 }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "v2a-asm-"));
    const { ffmpeg } = resolveFfmpegPair();
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const runCmd = promisify(execFile);

    // Two one-second clips, generated for real.
    const clips: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const clip = path.join(dir, `clip-${i}.mp4`);
      await runCmd(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", `color=c=${i === 0 ? "navy" : "teal"}:s=320x180:d=1:r=24`,
        "-pix_fmt", "yuv420p", "-y", clip,
      ]);
      clips.push(clip);
    }

    const out = path.join(dir, "assembled.mp4");
    const result = await assembleScenes(clips, out);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(1);
  });

  it("refuses an empty clip list rather than writing an empty file", async () => {
    await expect(assembleScenes([], "/tmp/out.mp4")).rejects.toThrow(/nothing to assemble/i);
  });

  it("refuses a missing clip by name", async () => {
    await expect(assembleScenes(["/tmp/does-not-exist.mp4"], "/tmp/out.mp4")).rejects.toThrow(/missing or empty/i);
  });
});
