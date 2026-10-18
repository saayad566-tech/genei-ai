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
import { LlamaCppAdapter } from "./llamaCpp";
import type { AdapterStatus, ExecutionAdapter } from "./types";

export * from "./types";
export { ComfyUiAdapter } from "./comfyui";
export { FfmpegAdapter, LipSyncAdapter, UpscalerAdapter, WhisperCppAdapter, extractPercent, evalFraction } from "./cliAdapters";
export { VlmReviewerAdapter, parseReviewResponse } from "./vlmReviewer";
export { detectHardware, runSelfTest } from "./selfTest";
export type { HardwareReport, SelfTestReport, SelfTestStep } from "./selfTest";

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
  /** The local language model that runs the Director. */
  llamaUrl: string;
  llamaBinary: string;
  llamaModel: string;
  llamaMmproj?: string;
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
    // The local Director model. Nothing is assumed: an unset path stays empty and the
    // adapter reports not_installed rather than pretending a model exists.
    llamaUrl: process.env.GENEI_LLAMA_URL?.trim() || "http://127.0.0.1:8081",
    llamaBinary: process.env.GENEI_LLAMA_BIN?.trim() || "",
    llamaModel: process.env.GENEI_LLAMA_MODEL?.trim() || "",
    llamaMmproj: process.env.GENEI_LLAMA_MMPROJ?.trim(),
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
  llamaCpp: LlamaCppAdapter;
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
    llamaCpp: new LlamaCppAdapter({
      baseUrl: config.llamaUrl,
      binaryPath: config.llamaBinary,
      modelPath: config.llamaModel,
      mmprojPath: config.llamaMmproj,
    }),
  };
}

export type Capability =
  | "video_generation"
  | "image_generation"
  | "lipsync"
  | "upscale"
  | "transcribe"
  | "review"
  | "assemble"
  | "text_generation";

/** Explicit, documented preference order per capability. */
const PREFERENCE: Record<Capability, string[]> = {
  video_generation: ["comfyui"],
  image_generation: ["comfyui"],
  lipsync: ["musetalk", "wav2lip"],
  upscale: ["video2x", "realesrgan"],
  transcribe: ["whisper"],
  review: ["reviewer"],
  assemble: ["ffmpeg"],
  text_generation: ["llamaCpp"],
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

/**
 * How every registered tool is actually served.
 *
 * A registry entry with nothing behind it is the most misleading kind of unfinished
 * work: it appears in the Model Library, it can be "installed", and it does nothing.
 * This map makes the link explicit and `unservedTools()` proves it — every tool in the
 * registry must name something that can really run it.
 *
 * `via` records *how* it is served, because not every tool is driven by its own adapter:
 *   adapter          — a dedicated adapter drives the tool directly
 *   workflow-host    — the tool runs as a workflow inside another tool
 *   openai-endpoint  — the tool is reached over an OpenAI-compatible HTTP endpoint
 */
export type ToolBinding = {
  toolId: string;
  servedBy: string[];
  via: "adapter" | "workflow-host" | "openai-endpoint";
  note: string;
};

export const TOOL_BINDINGS: readonly ToolBinding[] = [
  { toolId: "ffmpeg", servedBy: ["ffmpeg"], via: "adapter", note: "Assembly, frame extraction and the deterministic validator all run through this adapter." },
  { toolId: "llama-cpp", servedBy: ["llamaCpp"], via: "adapter", note: "The local Director model, driven through llama-server's HTTP API." },
  { toolId: "comfyui", servedBy: ["comfyui"], via: "adapter", note: "The graph runner that hosts the video and image workflows." },
  { toolId: "wan22", servedBy: ["comfyui"], via: "workflow-host", note: "Wan2.2 is a diffusion model, not a program: it runs as a ComfyUI workflow, so ComfyUI is its runtime." },
  { toolId: "qwen3-vl", servedBy: ["reviewer"], via: "openai-endpoint", note: "Served over an OpenAI-compatible vision endpoint (llama-server or another host); the reviewer adapter speaks to it." },
  { toolId: "musetalk", servedBy: ["musetalk"], via: "adapter", note: "Lip sync, run as a Python inference script." },
  { toolId: "wav2lip", servedBy: ["wav2lip"], via: "adapter", note: "Alternative lip-sync engine, run as a Python inference script." },
  { toolId: "whisper-cpp", servedBy: ["whisper"], via: "adapter", note: "Transcription and subtitle timing." },
  { toolId: "video2x", servedBy: ["video2x"], via: "adapter", note: "Upscaling and frame interpolation." },
  { toolId: "real-esrgan", servedBy: ["realesrgan"], via: "adapter", note: "Alternative upscaler, used when Video2X is unavailable or its Vulkan backend is missing." },
];

/**
 * Registry tools that nothing in the execution plane can run.
 *
 * Returns the tool ids, so a caller (or a test) can fail loudly rather than shipping a
 * tool that only looks installable.
 */
export function unservedTools(registryIds: readonly string[], adapters?: AdapterSet): string[] {
  const bindings = new Map(TOOL_BINDINGS.map((binding) => [binding.toolId, binding]));
  const available = adapters ? new Set(Object.keys(adapters)) : null;

  return registryIds.filter((toolId) => {
    const binding = bindings.get(toolId);
    if (!binding) return true;
    if (binding.servedBy.length === 0) return true;
    if (available && !binding.servedBy.some((key) => available.has(key))) return true;
    return false;
  });
}
