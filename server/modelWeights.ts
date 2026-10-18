/**
 * Model-weight resolver.
 *
 * Where a model's files are published on the Hugging Face Hub, the file list, sizes
 * and download URLs are read from the Hub API at resolve time. That is how the
 * platform avoids inventing weight URLs: the catalogue names the *repository*, and
 * the resolver discovers what is actually in it.
 *
 * Models that are not on the Hub still report `needs_source` and ask the user for a
 * location rather than being given a made-up one.
 */

export type WeightFile = {
  id: string;
  toolId: string;
  role: string;
  repo: string;
  path: string;
  url: string;
  sizeBytes: number;
  /** Which file the platform would pick by default for this tool. */
  recommended: boolean;
  note?: string;
};

export type WeightCatalogueEntry = {
  toolId: string;
  repo: string;
  role: string;
  /** Only files matching this are listed. */
  include: RegExp;
  /** The single file preferred when nothing else is chosen. */
  prefer: RegExp;
  note: string;
};

/**
 * Repositories named in the platform's own architecture documents. Sizes and URLs are
 * resolved live; nothing about the contents is hardcoded.
 */
export const WEIGHT_CATALOGUE: readonly WeightCatalogueEntry[] = [
  {
    toolId: "whisper-cpp",
    repo: "ggerganov/whisper.cpp",
    role: "Speech recognition model",
    include: /^ggml-(tiny|base|small|medium|large)[\w.-]*\.bin$/,
    prefer: /^ggml-large-v3-turbo-q5_0\.bin$/,
    note: "whisper.cpp GGML models. Quantised variants are smaller and faster on CPU.",
  },
  {
    toolId: "llama-cpp",
    repo: "bartowski/Qwen2.5-7B-Instruct-GGUF",
    role: "Local Director language model",
    include: /^Qwen2\.5-7B-Instruct-Q[0-9]_K_[MS]\.gguf$/,
    prefer: /^Qwen2\.5-7B-Instruct-Q4_K_M\.gguf$/,
    note: "A 7B instruction model at 4-bit, about 4.7 GB — the size that runs on an ordinary laptop. Larger quants are listed but need more memory.",
  },
  {
    toolId: "qwen3-vl",
    repo: "Qwen/Qwen3-VL-8B-Instruct-GGUF",
    role: "Vision reviewer (language model)",
    include: /^Qwen3VL-8B-Instruct-Q4_K_M\.gguf$/,
    prefer: /^Qwen3VL-8B-Instruct-Q4_K_M\.gguf$/,
    note: "The reviewer's language model. The matching vision encoder is in the mmproj entry below; both are needed for review.",
  },
  {
    toolId: "qwen3-vl",
    repo: "Qwen/Qwen3-VL-8B-Instruct-GGUF",
    role: "Vision reviewer (vision encoder)",
    include: /^mmproj-Qwen3VL-8B-Instruct-(F16|Q8_0)\.gguf$/,
    prefer: /^mmproj-Qwen3VL-8B-Instruct-F16\.gguf$/,
    note: "The multimodal projector. Without it the model can read text but cannot see a frame, so the reviewer would be blind.",
  },
  {
    toolId: "wan22",
    repo: "Wan-AI/Wan2.2-TI2V-5B",
    role: "Text/image-to-video model",
    include: /\.(safetensors|pth|bin)$/,
    prefer: /diffusion_pytorch_model.*\.safetensors$/,
    note: "Alibaba's official 5B TI2V model — the variant that runs on a single consumer GPU at 720p/24fps. The 14B MoE variants need far more VRAM.",
  },
  {
    toolId: "musetalk",
    repo: "TMElyralab/MuseTalk",
    role: "Lip-sync model weights",
    include: /\.(pth|bin|safetensors)$/,
    prefer: /unet\.pth$/,
    note: "MuseTalk 1.5. It also needs a VAE, a whisper encoder and a face detector; those are listed from the same repository where present.",
  },
  {
    toolId: "wav2lip",
    repo: "Nekochu/Wav2Lip",
    role: "Lip-sync model weights",
    include: /^wav2lip(_gan)?\.pth$/,
    prefer: /^wav2lip_gan\.pth$/,
    note: "The GAN variant produces sharper mouths; the base model is more faithful to the source. Both are ~436 MB.",
  },
  {
    toolId: "real-esrgan",
    repo: "wkrettek/real-esrgan-models",
    role: "Upscaling model weights",
    include: /^realesrgan_x4plus.*\.safetensors$/,
    prefer: /^realesrgan_x4plus\.safetensors$/,
    note: "A SafeTensors conversion of the official Real-ESRGAN x4plus weights (BSD-3). SafeTensors is preferred over pickle checkpoints for loading safety.",
  },
];

export type WeightResolveOptions = {
  fetchImpl?: typeof fetch;
  offline?: boolean;
  token?: string;
  /** Cap the number of files returned per repository. */
  limit?: number;
};

type HubTreeEntry = { type?: string; path?: string; size?: number };

function hubUrl(repo: string, path: string): string {
  return `https://huggingface.co/${repo}/resolve/main/${path}`;
}

/** Read the real file listing for a Hub repository. */
export async function listHuggingFaceTree(repo: string, options: WeightResolveOptions = {}): Promise<{ files: HubTreeEntry[]; error?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "GeneiAI" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  try {
    // `recursive=true` is required: without it the Hub lists only top-level entries, so a
    // model whose weights live in a subdirectory (MuseTalk's `musetalkV15/unet.pth`,
    // Wan2.2's sharded safetensors) appears to have no weights at all.
    const response = await fetchImpl(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      return { files: [], error: `The Hugging Face API answered HTTP ${response.status} for ${repo}.` };
    }
    const payload = (await response.json()) as HubTreeEntry[];
    return { files: Array.isArray(payload) ? payload : [] };
  } catch (error) {
    return { files: [], error: `Could not reach the Hugging Face API for ${repo}: ${error instanceof Error ? error.message : "unknown error"}.` };
  }
}

/**
 * Build the weight catalogue for one entry, reading real sizes from the Hub.
 * A failure is reported as an error rather than an empty success.
 */
export async function resolveWeightCatalogue(
  entry: WeightCatalogueEntry,
  options: WeightResolveOptions = {},
): Promise<{ files: WeightFile[]; error?: string }> {
  if (options.offline) {
    return { files: [], error: "Offline: the Hugging Face Hub was not consulted, so no weight files are listed." };
  }
  const { files, error } = await listHuggingFaceTree(entry.repo, options);
  if (error) return { files: [], error };

  const matching = files
    .filter((file) => file.type === "file" && typeof file.path === "string" && entry.include.test(file.path) && !/for-tests/.test(file.path))
    .filter((file) => typeof file.size === "number" && file.size > 0)
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  const limited = typeof options.limit === "number" ? matching.slice(0, options.limit) : matching;
  const preferred = limited.find((file) => entry.prefer.test(file.path ?? "")) ?? limited[0];

  if (limited.length === 0) {
    // The repository answered but holds nothing this entry expects. Saying so is the
    // difference between "we looked and found nothing" and a silent empty success.
    return {
      files: [],
      error: `No file matching this entry was found in ${entry.repo} (${files.length} file(s) were listed). The repository may have been reorganised, or the expected file has a different name.`,
    };
  }

  return {
    files: limited.map((file) => ({
      id: `${entry.toolId}:${file.path}`,
      toolId: entry.toolId,
      role: entry.role,
      repo: entry.repo,
      path: file.path as string,
      url: hubUrl(entry.repo, file.path as string),
      sizeBytes: file.size ?? 0,
      recommended: preferred ? file.path === preferred.path : false,
      note: entry.note,
    })),
  };
}

/** Every catalogue entry, resolved live. */
export async function resolveAllWeights(options: WeightResolveOptions = {}): Promise<Array<{ toolId: string; files: WeightFile[]; error?: string }>> {
  const results = await Promise.all(WEIGHT_CATALOGUE.map(async (entry) => ({ toolId: entry.toolId, ...(await resolveWeightCatalogue(entry, options)) })));
  return results;
}

/**
 * Resolve an arbitrary Hub repository the user supplied. This is how a tool that
 * reports `needs_source` becomes installable without anyone inventing a URL: the user
 * names the repository and the real files are discovered from it.
 */
export async function resolveUserSuppliedRepo(repo: string, toolId: string, options: WeightResolveOptions = {}): Promise<{ files: WeightFile[]; error?: string }> {
  const cleaned = repo.trim().replace(/^https?:\/\/huggingface\.co\//, "").replace(/\/+$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    return { files: [], error: `"${repo}" is not a Hugging Face repository id of the form owner/name.` };
  }
  return resolveWeightCatalogue(
    { toolId, repo: cleaned, role: "User-supplied weights", include: /\.(bin|gguf|safetensors|pth|ckpt|onnx)$/i, prefer: /q4_k_m|q5_k_m|fp16|f16/i, note: `Resolved from ${cleaned}.` },
    options,
  );
}

export function formatWeightSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "size unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
