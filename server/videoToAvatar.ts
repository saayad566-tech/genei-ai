/**
 * Video-to-avatar: analyse an uploaded video, derive an avatar from it, and plan a NEW
 * original video starring that avatar.
 *
 * The pipeline is deliberately staged and inspectable, because each stage is a place a
 * naive implementation would fabricate a result:
 *
 *   1. probe      — real ffprobe. No file, no analysis.
 *   2. extract    — real ffmpeg frame extraction. No frames, no analysis.
 *   3. analyse    — a vision model reads the frames. No model, no analysis: the stage
 *                   returns `unavailable` with the reason, never a guessed description.
 *   4. avatar     — derived from that analysis, deterministically.
 *   5. plan       — an ORIGINAL scene plan. It is not a reconstruction of the source.
 *   6. generate   — submitted to the execution plane. Reports what is missing.
 *   7. assemble   — real ffmpeg concat.
 *
 * Nothing here invents a description, a face, or a clip. If a stage cannot run, it says so
 * and the pipeline stops at that stage with an actionable reason.
 */

import { execFile } from "node:child_process";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type VideoProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
  sizeBytes: number;
};

export type SubjectDescription = {
  /** Plain-language description of the person, as the model reported it. */
  description: string;
  /** Details that must stay constant across scenes, or continuity breaks. */
  distinguishing: string[];
  wardrobe: string[];
  setting: string[];
  visualStyle: string[];
  motion: string[];
  mood: string;
  shotCount: number;
  pacing: string;
};

export type AnalysisResult =
  | {
      status: "ok";
      analysis: SubjectDescription;
      model: string;
      framesAnalysed: number;
      /** The frames the model actually saw, so a user can check the input. */
      framePaths: string[];
    }
  | {
      status: "unavailable";
      /** Exactly why, in words a user can act on. */
      reason: string;
      framesAnalysed: number;
    };

export type AvatarProfile = {
  id: string;
  /** A stable name so the avatar can be reused across projects. */
  name: string;
  appearance: string;
  wardrobe: string[];
  distinguishing: string[];
  /** Everything that must remain consistent, as a single prompt fragment. */
  consistencyPrompt: string;
  derivedFrom: { framesAnalysed: number; model: string };
};

export type PlannedScene = {
  index: number;
  durationSeconds: number;
  /** What happens. Original to this plan, not a copy of the source. */
  action: string;
  /** The generation prompt, with the avatar's consistency fragment included. */
  prompt: string;
  camera: string;
  avatarOnScreen: boolean;
};

export type OriginalPlan = {
  title: string;
  logline: string;
  scenes: PlannedScene[];
  totalDurationSeconds: number;
  /** Said plainly, because this is the point of the feature. */
  originalityNote: string;
};

export type ConsentRecord = {
  /** The user must affirm they have the right to this person's likeness. */
  affirmed: boolean;
  affirmedAt: string;
  /** Free-text assertion of the basis, kept for the audit trail. */
  basis: string;
};

/* ------------------------------------------------------------------ *
 * Consent — this feature clones a person's likeness
 * ------------------------------------------------------------------ */

export class LikenessConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LikenessConsentError";
  }
}

/**
 * Gate the pipeline on an explicit affirmation of likeness rights.
 *
 * This is not red tape. The feature takes a person's face and voice from a video and
 * generates new footage of them; doing that to someone who has not agreed is the defining
 * harm in this class of tool. The gate is enforced in the engine rather than only in the
 * UI, so no caller can reach generation without it.
 */
export function requireConsent(consent: ConsentRecord | undefined): ConsentRecord {
  if (!consent || !consent.affirmed) {
    throw new LikenessConsentError(
      "Generating an avatar from a video requires an explicit affirmation that you have the right to use this person's likeness. " +
        "Confirm you are the person in the video, or that you hold their written permission.",
    );
  }
  if (!consent.basis || consent.basis.trim().length < 3) {
    throw new LikenessConsentError(
      "State the basis on which you have the right to use this likeness (for example \"it is me\", or \"I hold signed permission\").",
    );
  }
  return consent;
}

/* ------------------------------------------------------------------ *
 * 1. Probe — real ffprobe
 * ------------------------------------------------------------------ */

export function resolveFfmpegPair(): { ffmpeg: string; ffprobe: string } {
  const configured = process.env.GENEI_FFMPEG_BIN?.trim();
  const exe = process.platform === "win32";
  const ffmpeg = configured || (exe ? "ffmpeg.exe" : "ffmpeg");
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, exe ? "ffprobe.exe" : "ffprobe");
  return { ffmpeg, ffprobe };
}

export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`No video file at ${filePath}.`);
  }
  if (stat.size === 0) {
    throw new Error(`The video at ${filePath} is empty (0 bytes).`);
  }

  const { ffprobe } = resolveFfmpegPair();
  let stdout: string;
  try {
    ({ stdout } = await run(
      ffprobe,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { maxBuffer: 16 * 1024 * 1024 },
    ));
  } catch (error) {
    throw new Error(
      `ffprobe could not read ${path.basename(filePath)}. Is it a video? ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }>;
  };

  const video = (parsed.streams ?? []).find((s) => s.codec_type === "video");
  if (!video) {
    throw new Error(`${path.basename(filePath)} contains no video stream.`);
  }

  const [num, den] = (video.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den ? Math.round((num / den) * 100) / 100 : 0;

  return {
    durationSeconds: Math.round(Number(parsed.format?.duration ?? 0) * 100) / 100,
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps: Number.isFinite(fps) ? fps : 0,
    codec: video.codec_name ?? "unknown",
    hasAudio: (parsed.streams ?? []).some((s) => s.codec_type === "audio"),
    sizeBytes: stat.size,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Extract — real ffmpeg frames
 * ------------------------------------------------------------------ */

export async function extractAnalysisFrames(
  filePath: string,
  probe: VideoProbe,
  count = 8,
  outDir?: string,
): Promise<string[]> {
  if (count < 1) throw new Error("At least one analysis frame is required.");
  if (probe.durationSeconds <= 0) {
    throw new Error("The video reports a zero duration, so frames cannot be sampled.");
  }

  const dir = outDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "genei-v2a-")));
  await fs.mkdir(dir, { recursive: true });

  const { ffmpeg } = resolveFfmpegPair();
  // Evenly spaced, avoiding the first and last 5% where fades and slates usually sit.
  const frames: string[] = [];
  const start = probe.durationSeconds * 0.05;
  const span = probe.durationSeconds * 0.9;
  const step = span / Math.max(1, count - 1);

  for (let i = 0; i < count; i += 1) {
    const at = start + step * i;
    const out = path.join(dir, `frame-${String(i).padStart(2, "0")}.jpg`);
    try {
      await run(
        ffmpeg,
        ["-hide_banner", "-loglevel", "error", "-ss", at.toFixed(3), "-i", filePath, "-frames:v", "1", "-q:v", "3", "-y", out],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      const st = await fs.stat(out).catch(() => null);
      if (st && st.size > 0) frames.push(out);
    } catch {
      // A frame that will not decode is skipped, not fatal: the rest still describe the video.
    }
  }

  if (frames.length === 0) {
    throw new Error("No frames could be extracted from this video, so it cannot be analysed.");
  }
  return frames;
}

/* ------------------------------------------------------------------ *
 * 3. Analyse — a vision model reads the frames
 * ------------------------------------------------------------------ */

export type VlmConfig = { baseUrl: string; model: string; apiKey?: string };

export function vlmConfigFromEnv(): VlmConfig | null {
  const baseUrl = process.env.GENEI_VLM_URL?.trim();
  const model = process.env.GENEI_VLM_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return { baseUrl, model, apiKey: process.env.GENEI_VLM_API_KEY?.trim() };
}

function toDataUrl(filePath: string): string | null {
  // A frame can vanish between extraction and analysis — a temp directory cleaned up, a
  // caller passing a stale path. Returning null rather than throwing keeps that a reported
  // condition instead of a crash, and the caller decides whether enough frames survived.
  try {
    const buf = readFileSync(filePath);
    if (buf.length === 0) return null;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const ANALYSIS_SYSTEM = `You are a film analyst. You are shown frames sampled in order from one video.

Describe ONLY what is visible in the frames. Do not invent detail. If something cannot be
determined from the frames, say "not visible" for that field.

Reply with JSON only, matching exactly this shape:
{
  "description": "one or two sentences describing the person and what they are doing",
  "distinguishing": ["stable visual details that must stay identical across new scenes"],
  "wardrobe": ["clothing and accessories visible"],
  "setting": ["locations and background elements"],
  "visualStyle": ["lighting, colour palette, camera treatment"],
  "motion": ["how the subject moves"],
  "mood": "one word or short phrase",
  "shotCount": <integer estimate of distinct shots>,
  "pacing": "slow | measured | brisk | fast"
}`;

export async function analyseVideo(
  framePaths: string[],
  config: VlmConfig | null = vlmConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<AnalysisResult> {
  if (framePaths.length === 0) {
    return { status: "unavailable", reason: "No frames were available to analyse.", framesAnalysed: 0 };
  }
  if (!config) {
    return {
      status: "unavailable",
      reason:
        "No vision model is configured, so this video cannot be analysed. Set GENEI_VLM_URL and GENEI_VLM_MODEL to a vision-capable model (for example a local llava or Qwen-VL server), then try again. Nothing is guessed in the meantime.",
      framesAnalysed: 0,
    };
  }

  const images = framePaths.map(toDataUrl).filter((value): value is string => value !== null);
  if (images.length === 0) {
    return {
      status: "unavailable",
      reason:
        "None of the extracted frames could be read, so there is nothing to analyse. The files may have been removed or may not be images.",
      framesAnalysed: 0,
    };
  }
  const body = {
    model: config.model,
    temperature: 0,
    max_tokens: 900,
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: `Here are ${images.length} frames, in chronological order.` },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      status: "unavailable",
      reason: `The vision model at ${config.baseUrl} could not be reached: ${error instanceof Error ? error.message : "unknown error"}.`,
      framesAnalysed: 0,
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: `The vision model returned ${response.status}. Check that ${config.model} is a vision-capable model and the endpoint is an OpenAI-compatible /chat/completions server.`,
      framesAnalysed: 0,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return { status: "unavailable", reason: "The vision model returned an empty response.", framesAnalysed: 0 };
  }

  const parsed = parseAnalysis(content);
  if (!parsed) {
    return {
      status: "unavailable",
      reason: "The vision model replied with something that is not the requested JSON, so no description can be trusted.",
      framesAnalysed: 0,
    };
  }

  return { status: "ok", analysis: parsed, model: config.model, framesAnalysed: images.length, framePaths };
}

/** Tolerant of a model wrapping its JSON in prose or a code fence. */
export function parseAnalysis(content: string): SubjectDescription | null {
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];

  const description = str(raw.description);
  if (!description) return null;

  const shotCount = Number(raw.shotCount);
  return {
    description,
    distinguishing: list(raw.distinguishing),
    wardrobe: list(raw.wardrobe),
    setting: list(raw.setting),
    visualStyle: list(raw.visualStyle),
    motion: list(raw.motion),
    mood: str(raw.mood) || "not visible",
    shotCount: Number.isFinite(shotCount) && shotCount > 0 ? Math.round(shotCount) : 1,
    pacing: str(raw.pacing) || "measured",
  };
}

/* ------------------------------------------------------------------ *
 * 4. Avatar — derived deterministically from the analysis
 * ------------------------------------------------------------------ */

export function buildAvatarProfile(analysis: SubjectDescription, model: string, framesAnalysed: number): AvatarProfile {
  const distinguishing = analysis.distinguishing.length > 0 ? analysis.distinguishing : ["appearance as described in the source video"];
  const wardrobe = analysis.wardrobe.length > 0 ? analysis.wardrobe : ["neutral clothing matching the source"];

  // The consistency fragment is the single most important output: it is what keeps the
  // face, hair and wardrobe identical from scene to scene.
  const consistencyPrompt = [
    analysis.description,
    `Always identical: ${distinguishing.join("; ")}.`,
    `Wardrobe: ${wardrobe.join("; ")}.`,
  ].join(" ");

  const id = `avatar-${Date.now().toString(36)}-${Math.abs(hash(consistencyPrompt)).toString(36).slice(0, 6)}`;

  return {
    id,
    name: "Derived avatar",
    appearance: analysis.description,
    wardrobe,
    distinguishing,
    consistencyPrompt,
    derivedFrom: { framesAnalysed, model },
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/* ------------------------------------------------------------------ *
 * 5. Plan — an ORIGINAL video, not a reconstruction
 * ------------------------------------------------------------------ */

export function planOriginalVideo(avatar: AvatarProfile, analysis: SubjectDescription): OriginalPlan {
  const setting = analysis.setting[0] ?? "a neutral interior";
  const style = analysis.visualStyle.join(", ") || "natural light, neutral palette";
  const mood = analysis.mood;

  const beats = [
    { action: "Opens on the avatar entering the space, establishing who they are.", camera: "slow push in" },
    { action: "A close moment: the avatar reacts to something off-screen.", camera: "static, shallow focus" },
    { action: "The avatar moves through the space, revealing the setting.", camera: "tracking, following the subject" },
    { action: "A held beat where the avatar looks directly to camera.", camera: "locked off, medium close-up" },
    { action: "The avatar turns away and the scene resolves.", camera: "slow pull out" },
  ];

  const scenes: PlannedScene[] = beats.map((beat, i) => ({
    index: i + 1,
    durationSeconds: i === beats.length - 1 ? 6 : 5,
    action: beat.action,
    prompt: [
      avatar.consistencyPrompt,
      `Setting: ${setting}.`,
      `Style: ${style}. Mood: ${mood}.`,
      beat.action,
      "Photorealistic, consistent face and wardrobe, no distortion, no warping.",
    ].join(" "),
    camera: beat.camera,
    avatarOnScreen: true,
  }));

  const totalDurationSeconds = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

  return {
    title: `A new scene with ${avatar.name}`,
    logline: `An original short featuring the avatar derived from the uploaded video, in ${setting}, ${mood}.`,
    scenes,
    totalDurationSeconds,
    originalityNote:
      "This plan is newly written. It borrows the subject's appearance and visual style from the source, " +
      "and deliberately does not reproduce its shots, sequence or audio. The output is a new work featuring " +
      "the same person, not a copy or an edit of the original.",
  };
}

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

export type PipelineStage = "probe" | "extract" | "analyse" | "avatar" | "plan";

export type PipelineResult =
  | {
      status: "planned";
      stage: "plan";
      probe: VideoProbe;
      analysis: SubjectDescription;
      avatar: AvatarProfile;
      plan: OriginalPlan;
      model: string;
    }
  | {
      status: "stopped";
      stage: PipelineStage;
      reason: string;
      probe?: VideoProbe;
      framesAnalysed: number;
    };

/**
 * Runs probe → extract → analyse → avatar → plan.
 *
 * Stops at the first stage that cannot complete, and says which one and why. It never
 * returns a plan built on an invented analysis.
 */
export async function analyseVideoToPlan(
  filePath: string,
  consent: ConsentRecord | undefined,
  options: { frameCount?: number; config?: VlmConfig | null; fetchImpl?: typeof fetch; outDir?: string } = {},
): Promise<PipelineResult> {
  // Consent first: there is no point probing a video we are not permitted to use.
  requireConsent(consent);

  let probe: VideoProbe;
  try {
    probe = await probeVideo(filePath);
  } catch (error) {
    return {
      status: "stopped",
      stage: "probe",
      reason: error instanceof Error ? error.message : "The video could not be probed.",
      framesAnalysed: 0,
    };
  }

  let frames: string[];
  try {
    frames = await extractAnalysisFrames(filePath, probe, options.frameCount ?? 8, options.outDir);
  } catch (error) {
    return {
      status: "stopped",
      stage: "extract",
      reason: error instanceof Error ? error.message : "Frames could not be extracted.",
      probe,
      framesAnalysed: 0,
    };
  }

  const result = await analyseVideo(frames, options.config ?? vlmConfigFromEnv(), options.fetchImpl);
  if (result.status === "unavailable") {
    return { status: "stopped", stage: "analyse", reason: result.reason, probe, framesAnalysed: result.framesAnalysed };
  }

  const avatar = buildAvatarProfile(result.analysis, result.model, result.framesAnalysed);
  const plan = planOriginalVideo(avatar, result.analysis);

  return {
    status: "planned",
    stage: "plan",
    probe,
    analysis: result.analysis,
    avatar,
    plan,
    model: result.model,
  };
}

/* ------------------------------------------------------------------ *
 * 7. Assemble — real ffmpeg concat
 * ------------------------------------------------------------------ */

export async function assembleScenes(clipPaths: string[], outPath: string): Promise<{ outPath: string; sizeBytes: number; durationSeconds: number }> {
  if (clipPaths.length === 0) throw new Error("No clips were supplied, so there is nothing to assemble.");
  for (const clip of clipPaths) {
    const st = await fs.stat(clip).catch(() => null);
    if (!st || st.size === 0) throw new Error(`Clip ${path.basename(clip)} is missing or empty.`);
  }

  const { ffmpeg } = resolveFfmpegPair();
  const listFile = path.join(path.dirname(outPath), `concat-${Date.now()}.txt`);
  const listing = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listFile, listing, "utf8");

  try {
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-y", outPath], {
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    await fs.unlink(listFile).catch(() => undefined);
  }

  const st = await fs.stat(outPath);
  if (!st || st.size === 0) throw new Error("ffmpeg reported success but produced no output file.");
  const probe = await probeVideo(outPath);
  return { outPath, sizeBytes: st.size, durationSeconds: probe.durationSeconds };
}
