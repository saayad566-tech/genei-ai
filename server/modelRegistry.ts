/**
 * Tool & model registry.
 *
 * The catalogue of things the onboarding screen can install. Every entry points at
 * a real, official source — these repositories are the ones named in the platform's
 * own architecture documents, so nothing here is an invented URL.
 *
 * Health is never assumed: an entry reports `installed: false` until an install has
 * actually completed and been recorded on disk, and `ready` is only ever set by a
 * real health check.
 */

export type ToolCategory = "runtime" | "video" | "image" | "audio" | "lipsync" | "upscale" | "media";

export type InstallKind = "git" | "archive" | "system" | "weights";

export type HealthState = "ready" | "degraded" | "stopped" | "installing" | "failed" | "unsupported" | "not_installed" | "needs_source";

export type ToolRequirement = {
  minRamMB: number;
  recommendedVramMB: number;
  /** Backends this tool can use; empty means "runs anywhere". */
  backends: Array<"cuda" | "rocm" | "vulkan" | "metal" | "cpu">;
  supportedOs: Array<"win32" | "darwin" | "linux">;
};

export type ToolEntry = {
  id: string;
  name: string;
  category: ToolCategory;
  summary: string;
  /** Official source. */
  repositoryUrl: string;
  docsUrl?: string;
  license: string;
  installKind: InstallKind;
  /** For `git` installs: the clone URL. For `archive`: the asset URL. */
  sourceUrl?: string;
  /** True when the tool fetches its own model weights on first run. */
  selfFetchingWeights: boolean;
  /** Set when weights must come from a source the user supplies. */
  requiresWeightSource: boolean;
  requirement: ToolRequirement;
  capabilities: string[];
  fallbackToolIds: string[];
  /** Rough download size, when known. Omitted rather than guessed. */
  approximateDownloadMB?: number;
};

export const TOOL_REGISTRY: readonly ToolEntry[] = [
  {
    id: "ffmpeg",
    name: "FFmpeg",
    category: "media",
    summary: "Assembly, encoding, muxing and the deterministic technical validator.",
    repositoryUrl: "https://ffmpeg.org",
    docsUrl: "https://ffmpeg.org/documentation.html",
    license: "LGPL/GPL",
    installKind: "system",
    selfFetchingWeights: false,
    requiresWeightSource: false,
    requirement: { minRamMB: 512, recommendedVramMB: 0, backends: ["cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["assemble", "transcode", "probe", "validate", "extract_frames"],
    fallbackToolIds: [],
  },
  {
    id: "llama-cpp",
    name: "llama.cpp",
    category: "runtime",
    summary: "Local LLM runtime for the Master AI Director. Model-agnostic.",
    repositoryUrl: "https://github.com/ggml-org/llama.cpp",
    license: "MIT",
    installKind: "git",
    sourceUrl: "https://github.com/ggml-org/llama.cpp.git",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 8192, recommendedVramMB: 6144, backends: ["cuda", "rocm", "vulkan", "metal", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["text_generation", "prompt_engineering", "screenplay", "shot_planning"],
    fallbackToolIds: [],
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    category: "image",
    summary: "Workflow engine for image and video generation.",
    repositoryUrl: "https://github.com/Comfy-Org/ComfyUI",
    docsUrl: "https://docs.comfy.org",
    license: "GPL-3.0",
    installKind: "git",
    sourceUrl: "https://github.com/Comfy-Org/ComfyUI.git",
    selfFetchingWeights: true,
    requiresWeightSource: false,
    requirement: { minRamMB: 8192, recommendedVramMB: 8192, backends: ["cuda", "rocm", "vulkan", "metal", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["workflow_load", "workflow_inject", "text_to_image", "image_to_image", "text_to_video", "image_to_video", "progress", "cancel"],
    fallbackToolIds: [],
  },
  {
    id: "wan22",
    name: "Wan2.2",
    category: "video",
    summary: "Video generation model family, including frame-conditioned workflows.",
    repositoryUrl: "https://github.com/Wan-Video/Wan2.2",
    docsUrl: "https://docs.comfy.org/tutorials/video/wan/wan2_2",
    license: "Apache-2.0",
    installKind: "weights",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 16384, recommendedVramMB: 12288, backends: ["cuda", "rocm", "vulkan", "metal", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["text_to_video", "image_to_video", "start_frame", "start_end_frames", "reference_frames"],
    fallbackToolIds: ["comfyui"],
  },
  {
    id: "qwen3-vl",
    name: "Qwen3-VL",
    category: "runtime",
    summary: "Vision-language model used by the AI reviewer to inspect generated media.",
    repositoryUrl: "https://github.com/QwenLM/Qwen3-VL",
    license: "Apache-2.0",
    installKind: "weights",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 16384, recommendedVramMB: 12288, backends: ["cuda", "rocm", "vulkan", "metal", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["frame_inspection", "identity_check", "continuity_check", "quality_scoring"],
    fallbackToolIds: [],
  },
  {
    id: "musetalk",
    name: "MuseTalk",
    category: "lipsync",
    summary: "Primary lip-sync engine.",
    repositoryUrl: "https://github.com/TMElyralab/MuseTalk",
    license: "MIT",
    installKind: "git",
    sourceUrl: "https://github.com/TMElyralab/MuseTalk.git",
    selfFetchingWeights: true,
    requiresWeightSource: false,
    requirement: { minRamMB: 16384, recommendedVramMB: 8192, backends: ["cuda"], supportedOs: ["win32", "linux"] },
    capabilities: ["lipsync"],
    fallbackToolIds: ["wav2lip"],
  },
  {
    id: "wav2lip",
    name: "Wav2Lip",
    category: "lipsync",
    summary: "Fallback lip-sync engine.",
    repositoryUrl: "https://github.com/Rudrabha/Wav2Lip",
    license: "See repository",
    installKind: "git",
    sourceUrl: "https://github.com/Rudrabha/Wav2Lip.git",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 8192, recommendedVramMB: 4096, backends: ["cuda", "cpu"], supportedOs: ["win32", "linux"] },
    capabilities: ["lipsync"],
    fallbackToolIds: [],
  },
  {
    id: "whisper-cpp",
    name: "whisper.cpp",
    category: "audio",
    summary: "Transcription, dialogue timing and subtitle timing.",
    repositoryUrl: "https://github.com/ggml-org/whisper.cpp",
    license: "MIT",
    installKind: "git",
    sourceUrl: "https://github.com/ggml-org/whisper.cpp.git",
    selfFetchingWeights: true,
    requiresWeightSource: false,
    requirement: { minRamMB: 4096, recommendedVramMB: 0, backends: ["cuda", "metal", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["transcribe", "dialogue_timing", "subtitle_timing", "audio_analysis"],
    fallbackToolIds: [],
  },
  {
    id: "video2x",
    name: "Video2X",
    category: "upscale",
    summary: "Video upscaling for approved final assets only.",
    repositoryUrl: "https://github.com/k4yt3x/video2x",
    license: "AGPL-3.0",
    installKind: "git",
    sourceUrl: "https://github.com/k4yt3x/video2x.git",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 8192, recommendedVramMB: 4096, backends: ["cuda", "vulkan", "cpu"], supportedOs: ["win32", "linux"] },
    capabilities: ["upscale"],
    fallbackToolIds: ["real-esrgan"],
  },
  {
    id: "real-esrgan",
    name: "Real-ESRGAN",
    category: "upscale",
    summary: "Fallback upscaler.",
    repositoryUrl: "https://github.com/xinntao/Real-ESRGAN",
    license: "BSD-3-Clause",
    installKind: "git",
    sourceUrl: "https://github.com/xinntao/Real-ESRGAN.git",
    selfFetchingWeights: false,
    requiresWeightSource: true,
    requirement: { minRamMB: 8192, recommendedVramMB: 4096, backends: ["cuda", "cpu"], supportedOs: ["win32", "darwin", "linux"] },
    capabilities: ["upscale"],
    fallbackToolIds: [],
  },
] as const;

export function getTool(id: string): ToolEntry | undefined {
  return TOOL_REGISTRY.find((tool) => tool.id === id);
}

export type HardwareProfile = {
  os: "win32" | "darwin" | "linux" | "unknown";
  ramGB: number | null;
  vramGB: number | null;
  backends: Array<"cuda" | "rocm" | "vulkan" | "metal" | "cpu">;
};

export type Compatibility = {
  toolId: string;
  status: "compatible" | "compatible_slow" | "unsupported" | "unknown";
  reasons: string[];
};

/**
 * Judge whether a tool can run on this machine. Unknown hardware yields "unknown"
 * rather than a hopeful yes — the platform must not claim compatibility it has not
 * tested.
 */
export function assessCompatibility(tool: ToolEntry, hardware: HardwareProfile): Compatibility {
  const reasons: string[] = [];
  if (hardware.os === "unknown" || hardware.ramGB === null) {
    return { toolId: tool.id, status: "unknown", reasons: ["Hardware could not be detected, so compatibility is unknown."] };
  }
  if (!tool.requirement.supportedOs.includes(hardware.os)) {
    return { toolId: tool.id, status: "unsupported", reasons: [`Not available on ${hardware.os}.`] };
  }

  const usableBackends = tool.requirement.backends.filter((backend) => hardware.backends.includes(backend));
  if (usableBackends.length === 0) {
    return {
      toolId: tool.id,
      status: "unsupported",
      reasons: [`Needs one of ${tool.requirement.backends.join(", ")}, none of which this machine reports.`],
    };
  }

  const hasAccelerator = usableBackends.some((backend) => backend !== "cpu");
  if (hardware.ramGB < tool.requirement.minRamMB / 1024) {
    return {
      toolId: tool.id,
      status: "unsupported",
      reasons: [`Needs at least ${Math.round(tool.requirement.minRamMB / 1024)} GB of memory; this machine reports ${hardware.ramGB} GB.`],
    };
  }

  if (!hasAccelerator && tool.requirement.recommendedVramMB > 0) {
    reasons.push(`No supported GPU detected, so this will run on CPU and be substantially slower.`);
    return { toolId: tool.id, status: "compatible_slow", reasons };
  }
  if (tool.requirement.recommendedVramMB > 0 && (hardware.vramGB ?? 0) < tool.requirement.recommendedVramMB / 1024) {
    reasons.push(
      `Recommended ${Math.round(tool.requirement.recommendedVramMB / 1024)} GB of video memory; this machine reports ${hardware.vramGB ?? 0} GB. It may still run, more slowly.`,
    );
    return { toolId: tool.id, status: "compatible_slow", reasons };
  }

  return { toolId: tool.id, status: "compatible", reasons };
}

/** The recommended install set for a machine, best-effort and explainable. */
export function recommendInstallSet(hardware: HardwareProfile): Array<{ toolId: string; compatibility: Compatibility }> {
  return TOOL_REGISTRY.map((tool) => ({ toolId: tool.id, compatibility: assessCompatibility(tool, hardware) })).filter(
    (entry) => entry.compatibility.status === "compatible" || entry.compatibility.status === "compatible_slow",
  );
}
