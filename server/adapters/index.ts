/**
 * Adapter registry.
 *
 * Constructs the execution-plane adapters from configuration and resolves which one
 * can actually serve a requested capability. Resolution always performs a real health
 * check: a tool is never selected because it is listed, only because it answered.
 *
 * Fallback order is explicit and reported — the caller is always told which adapter
 * was chosen and why, and is never told an alternative is equivalent when it is not.
 */

import path from "node:path";
import os from "node:os";
import { ComfyUiAdapter } from "./comfyui";
import { FfmpegAdapter, LipSyncAdapter, UpscalerAdapter, WhisperCppAdapter } from "./cliAdapters";
import { VlmReviewerAdapter } from "./vlmReviewer";
import type { AdapterStatus, ExecutionAdapter } from "./types";

export * from "./types";
export { ComfyUiAdapter } from "./comfyui";
export { FfmpegAdapter, LipSyncAdapter, UpscalerAdapter, WhisperCppAdapter, extractPercent, evalFraction } from "./cliAdapters";
export { VlmReviewerAdapter, parseReviewResponse } from "./vlmReviewer";

export type AdapterRuntimeConfig = {
  /** Where the workspace keeps its data. */
  dataDir: string;
  /** Where the installed tools live. */
  toolsDir: string;
  /** Where generated media is written. */
  mediaDir: string;
  comfyUrl: string;
  vlmUrl: string;
  vlmModel: string;
  vlmApiKey?: string;
};

export function runtimeConfig(overrides: Partial<AdapterRuntimeConfig> = {}): AdapterRuntimeConfig {
  const dataDir = process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
  const toolsDir = path.join(dataDir, "tools");
  return {
    dataDir,
    toolsDir,
    mediaDir: path.join(dataDir, "media"),
    comfyUrl: process.env.GENEI_COMFY_URL?.trim() || "http://127.0.0.1:8188",
    vlmUrl: process.env.GENEI_VLM_URL?.trim() || "http://127.0.0.1:8080/v1",
    vlmModel: process.env.GENEI_VLM_MODEL?.trim() || "",
    vlmApiKey: process.env.GENEI_VLM_API_KEY?.trim(),
    ...overrides,
  };
}

export type AdapterSet = {
  comfyui: ComfyUiAdapter;
  ffmpeg: FfmpegAdapter;
  whisper: WhisperCppAdapter;
  musetalk: LipSyncAdapter;
  wav2lip: LipSyncAdapter;
  video2x: UpscalerAdapter;
  realesrgan: UpscalerAdapter;
  reviewer: VlmReviewerAdapter;
};

export function buildAdapters(config: AdapterRuntimeConfig = runtimeConfig()): AdapterSet {
  const cliBase = { outputDir: config.mediaDir, searchDirs: [config.toolsDir] };
  return {
    comfyui: new ComfyUiAdapter({ baseUrl: config.comfyUrl, outputDir: config.mediaDir }),
    ffmpeg: new FfmpegAdapter(cliBase),
    whisper: new WhisperCppAdapter({ ...cliBase, installDir: path.join(config.toolsDir, "whisper-cpp") }),
    musetalk: new LipSyncAdapter({ ...cliBase, installDir: path.join(config.toolsDir, "musetalk") }, "musetalk"),
    wav2lip: new LipSyncAdapter({ ...cliBase, installDir: path.join(config.toolsDir, "wav2lip") }, "wav2lip"),
    video2x: new UpscalerAdapter({ ...cliBase, installDir: path.join(config.toolsDir, "video2x") }, "video2x"),
    realesrgan: new UpscalerAdapter({ ...cliBase, installDir: path.join(config.toolsDir, "real-esrgan") }, "real-esrgan"),
    reviewer: new VlmReviewerAdapter({ baseUrl: config.vlmUrl, model: config.vlmModel, apiKey: config.vlmApiKey }),
  };
}

export type Capability =
  | "video_generation"
  | "image_generation"
  | "lipsync"
  | "upscale"
  | "transcribe"
  | "review"
  | "assemble";

/** Explicit, documented preference order per capability. */
const PREFERENCE: Record<Capability, string[]> = {
  video_generation: ["comfyui"],
  image_generation: ["comfyui"],
  lipsync: ["musetalk", "wav2lip"],
  upscale: ["video2x", "realesrgan"],
  transcribe: ["whisper"],
  review: ["reviewer"],
  assemble: ["ffmpeg"],
};

export type Resolution = {
  capability: Capability;
  adapterId: string | null;
  status: AdapterStatus | null;
  /** Every candidate that was tried, in order, with its real status. */
  considered: Array<{ adapterId: string; state: string; message: string }>;
  /** True when the chosen adapter is not the first preference. */
  fellBack: boolean;
};

/**
 * Pick an adapter that genuinely answers for this capability.
 * Returns `adapterId: null` with the full considered list when nothing is available —
 * the caller must surface that rather than proceeding.
 */
export async function resolveAdapter(capability: Capability, adapters: AdapterSet): Promise<Resolution> {
  const candidates = PREFERENCE[capability] ?? [];
  const considered: Resolution["considered"] = [];
  let chosen: { id: string; adapter: ExecutionAdapter; status: AdapterStatus } | null = null;

  for (const id of candidates) {
    const adapter = (adapters as unknown as Record<string, ExecutionAdapter | undefined>)[id];
    if (!adapter) continue;
    const status = await adapter.healthCheck();
    considered.push({ adapterId: id, state: status.state, message: status.message });
    if (!chosen && status.state === "ready") chosen = { id, adapter, status };
  }

  if (!chosen) {
    return { capability, adapterId: null, status: null, considered, fellBack: false };
  }
  return {
    capability,
    adapterId: chosen.id,
    status: chosen.status,
    considered,
    fellBack: chosen.id !== candidates[0],
  };
}

/** Health of every adapter at once, for the UI. */
export async function adapterHealth(adapters: AdapterSet): Promise<Array<AdapterStatus>> {
  const entries = Object.values(adapters) as ExecutionAdapter[];
  const results = await Promise.all(entries.map((adapter) => adapter.healthCheck().catch((error: unknown) => ({
    state: "failed" as const,
    toolId: adapter.toolId,
    message: error instanceof Error ? error.message : "Health check failed.",
    checkedAt: new Date().toISOString(),
  }))));
  return results;
}
