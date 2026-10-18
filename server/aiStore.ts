/**
 * AI Store — a catalogue and runtime for open-source models.
 *
 * Three rules shape this service:
 *
 * 1. **Nothing is invented.** Models come from the Hugging Face Hub live. Capabilities
 *    come from `classifyModel`, which names the signal behind every label. Sizes come
 *    from the repository's own file listing.
 * 2. **Compatibility is stated with its basis.** The memory estimate is a documented
 *    rule of thumb, labelled as an estimate, not a measurement.
 * 3. **Execution reports what is actually available.** A model runs locally through the
 *    llama.cpp adapter, or through a hosted endpoint when a key is configured. If
 *    neither is ready, the caller is told exactly what is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyModel, type CapabilityProfile, type CapabilityId } from "../shared/modelCapabilities";
import { listHuggingFaceTree } from "./modelWeights";

const HF_BASE = "https://huggingface.co";

export type StoreModel = {
  id: string;
  author: string;
  name: string;
  downloads: number;
  likes: number;
  gated: boolean;
  disabled: boolean;
  pipelineTag?: string;
  profile: CapabilityProfile;
};

export type ModelFile = {
  path: string;
  sizeBytes: number;
  url: string;
  /** True for the single file the store would download by default. */
  recommended: boolean;
};

export type CompatibilityStatus = "fits" | "tight" | "too-large" | "unknown";

export type Compatibility = {
  status: CompatibilityStatus;
  reason: string;
  /** Estimated peak memory, in GB. */
  estimatedRamGB?: number;
  availableRamGB?: number | null;
  availableVramGB?: number | null;
};

export type Hardware = {
  ramGB: number | null;
  vramGB: number | null;
  backends: string[];
};

export type StoreOptions = {
  fetchImpl?: typeof fetch;
  token?: string;
  /** Skip the network; used by hermetic tests. */
  offline?: boolean;
};

function hfHeaders(options: StoreOptions): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "GeneiAI" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return headers;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Turn a Hub search result into a store entry, classified from its real metadata. */
export function toStoreModel(raw: Record<string, unknown>): StoreModel {
  const id = String(raw.id ?? raw.modelId ?? "");
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [];
  const profile = classifyModel({
    id,
    pipelineTag: typeof raw.pipeline_tag === "string" ? raw.pipeline_tag : undefined,
    tags,
    cardData: (raw.cardData as Record<string, unknown>) ?? undefined,
    downloads: asNumber(raw.downloads),
    likes: asNumber(raw.likes),
    gated: raw.gated as boolean | string | undefined,
    disabled: Boolean(raw.disabled),
    gguf: raw.gguf,
  });
  const [author, ...rest] = id.split("/");
  return {
    id,
    author: rest.length ? author : "community",
    name: rest.length ? rest.join("/") : id,
    downloads: asNumber(raw.downloads),
    likes: asNumber(raw.likes),
    gated: Boolean(raw.gated),
    disabled: Boolean(raw.disabled),
    pipelineTag: typeof raw.pipeline_tag === "string" ? raw.pipeline_tag : undefined,
    profile,
  };
}

/**
 * Search the Hub.
 *
 * `capability` is applied after classification rather than as a Hub filter, because the
 * Hub's own filters do not express "models good at data analysis" — the label has to be
 * derived, and a server-side filter would be a different (and wrong) question.
 */
export async function searchModels(
  input: { query?: string; capability?: CapabilityId | "general"; limit?: number; sort?: "downloads" | "likes" | "recent"; ggufOnly?: boolean },
  options: StoreOptions = {},
): Promise<{ models: StoreModel[]; source: string; note?: string }> {
  if (options.offline) {
    return { models: [], source: "offline", note: "The Hub was not consulted, so no models are listed." };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const params = new URLSearchParams();
  if (input.query?.trim()) params.set("search", input.query.trim());
  if (input.ggufOnly) params.set("filter", "gguf");
  const sort = input.sort === "likes" ? "likes" : input.sort === "recent" ? "lastModified" : "downloads";
  params.set("sort", sort);
  params.set("direction", "-1");
  // Over-fetch when a capability filter will be applied, so the page is not half-empty.
  params.set("limit", String(input.capability ? Math.min(limit * 4, 100) : limit));

  try {
    const response = await fetchImpl(`${HF_BASE}/api/models?${params.toString()}`, {
      headers: hfHeaders(options),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { models: [], source: "huggingface", note: `The Hugging Face Hub answered HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    let models = (Array.isArray(payload) ? payload : []).map(toStoreModel);

    if (input.capability) {
      models = models.filter((model) =>
        input.capability === "general"
          ? model.profile.primary === "general"
          : model.profile.capabilities.some((signal) => signal.id === input.capability),
      );
    }

    return {
      models: models.slice(0, limit),
      source: "huggingface",
      note: models.length === 0 && input.capability
        ? `Nothing in the top results is classified as ${input.capability}; try a different search or capability.`
        : undefined,
    };
  } catch (error) {
    return {
      models: [],
      source: "huggingface",
      note: `The Hugging Face Hub could not be reached: ${error instanceof Error ? error.message : "unknown error"}.`,
    };
  }
}

/** Read a single model and its real file listing. */
export async function resolveModel(
  id: string,
  options: StoreOptions = {},
): Promise<{ model: StoreModel; files: ModelFile[]; error?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const empty: StoreModel = toStoreModel({ id });
  if (options.offline) {
    return { model: empty, files: [], error: "Offline: the Hub was not consulted." };
  }

  try {
    const response = await fetchImpl(`${HF_BASE}/api/models/${id}`, {
      headers: hfHeaders(options),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { model: empty, files: [], error: `The Hugging Face Hub answered HTTP ${response.status} for ${id}.` };
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const model = toStoreModel(raw);

    const tree = await listHuggingFaceTree(id, { fetchImpl, token: options.token });
    if (tree.error) return { model, files: [], error: tree.error };

    const files: ModelFile[] = tree.files
      .filter((file) => file.type === "file" && typeof file.path === "string" && typeof file.size === "number" && file.size > 0)
      .filter((file) => /\.(gguf|safetensors|bin|onnx|pt)$/i.test(file.path as string))
      .map((file) => ({
        path: file.path as string,
        sizeBytes: file.size as number,
        url: `${HF_BASE}/${id}/resolve/main/${file.path}`,
        recommended: false,
      }))
      .sort((a, b) => a.sizeBytes - b.sizeBytes);

    // Prefer the balanced quantisation people actually run, then the smallest usable one.
    const preferred =
      files.find((file) => /q4_k_m/i.test(file.path)) ??
      files.find((file) => /q5_k_m|q4_k_s|q8_0/i.test(file.path)) ??
      files.find((file) => /\.gguf$/i.test(file.path)) ??
      files[0];
    for (const file of files) file.recommended = preferred ? file.path === preferred.path : false;

    return { model, files };
  } catch (error) {
    return { model: empty, files: [], error: `The Hugging Face Hub could not be reached: ${error instanceof Error ? error.message : "unknown error"}.` };
  }
}

/**
 * Estimate whether a model fits this machine.
 *
 * The rule of thumb: a quantised model's weights are roughly its file size, and the
 * runtime needs about 20% more for the context window and KV cache. This is an
 * **estimate**, and it says so — it is not a measurement of what the machine will do.
 */
export function checkCompatibility(files: ModelFile[], hardware: Hardware): Compatibility {
  const target = files.find((file) => file.recommended) ?? files[0];
  if (!target) {
    return { status: "unknown", reason: "No downloadable weight file was found, so the requirement cannot be estimated.", availableRamGB: hardware.ramGB, availableVramGB: hardware.vramGB };
  }

  const weightsGB = target.sizeBytes / 1024 ** 3;
  const estimatedRamGB = Math.round(weightsGB * 1.2 * 10) / 10;
  const available = hardware.vramGB && hardware.vramGB > 0 ? hardware.vramGB : hardware.ramGB;

  if (available === null || available === undefined || available <= 0) {
    return {
      status: "unknown",
      reason: `This machine's memory could not be read, so fit cannot be estimated. The weights alone are about ${weightsGB.toFixed(1)} GB.`,
      estimatedRamGB,
      availableRamGB: hardware.ramGB,
      availableVramGB: hardware.vramGB,
    };
  }

  const basis = hardware.vramGB && hardware.vramGB > 0 ? "video memory" : "system memory";
  if (estimatedRamGB <= available * 0.7) {
    return { status: "fits", reason: `About ${estimatedRamGB} GB needed (estimate: weights plus ~20% for context) against ${available} GB of ${basis}.`, estimatedRamGB, availableRamGB: hardware.ramGB, availableVramGB: hardware.vramGB };
  }
  if (estimatedRamGB <= available) {
    return { status: "tight", reason: `About ${estimatedRamGB} GB needed against ${available} GB of ${basis}. It should run, but leave little room for anything else.`, estimatedRamGB, availableRamGB: hardware.ramGB, availableVramGB: hardware.vramGB };
  }
  return {
    status: "too-large",
    reason: `About ${estimatedRamGB} GB needed against ${available} GB of ${basis}. Choose a smaller quantisation or a smaller model, or run it on a paired machine or a hosted endpoint.`,
    estimatedRamGB,
    availableRamGB: hardware.ramGB,
    availableVramGB: hardware.vramGB,
  };
}

/** Where downloaded models live. */
export function modelsDir(dataDir: string): string {
  return path.join(dataDir, "models");
}

/** Models already on disk, discovered rather than tracked, so the list cannot drift. */
export function listLocalModels(dataDir: string): Array<{ id: string; path: string; sizeBytes: number }> {
  const root = modelsDir(dataDir);
  if (!fs.existsSync(root)) return [];
  const out: Array<{ id: string; path: string; sizeBytes: number }> = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const id = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, id);
      else if (/\.(gguf|safetensors|onnx)$/i.test(entry.name)) {
        out.push({ id, path: full, sizeBytes: fs.statSync(full).size });
      }
    }
  };
  walk(root, "");
  return out.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** Remove a downloaded model. Refuses to leave the models directory. */
export function removeLocalModel(dataDir: string, id: string): { removed: boolean; message: string } {
  const root = path.resolve(modelsDir(dataDir));
  const target = path.resolve(root, id);
  if (!target.startsWith(root + path.sep)) {
    return { removed: false, message: "That path is outside the models directory." };
  }
  if (!fs.existsSync(target)) return { removed: false, message: `${id} is not installed.` };
  fs.rmSync(target, { force: true });
  return { removed: true, message: `Removed ${id}.` };
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

export type DownloadResult = { ok: boolean; path?: string; bytes?: number; message: string };

/**
 * Download one weight file into the models directory.
 *
 * Writes to a `.part` file and renames on success, so an interrupted download can never
 * be mistaken for a complete model. The size is verified against what the Hub declared:
 * a short download is a failure, not a finished install.
 */
export async function downloadModel(input: {
  id: string;
  filePath: string;
  url: string;
  expectedBytes: number;
  dataDir: string;
  token?: string;
  fetchImpl?: typeof fetch;
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
}): Promise<DownloadResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const dir = path.join(modelsDir(input.dataDir), input.id);
  const target = path.join(dir, path.basename(input.filePath));
  const partial = `${target}.part`;

  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(target)) {
    const existing = fs.statSync(target).size;
    if (existing === input.expectedBytes) {
      return { ok: true, path: target, bytes: existing, message: `Already installed (${existing} bytes).` };
    }
    // A file of the wrong size is not an install; replace it rather than trust it.
    fs.rmSync(target, { force: true });
  }

  try {
    const headers: Record<string, string> = { "user-agent": "GeneiAI" };
    if (input.token) headers.authorization = `Bearer ${input.token}`;
    const response = await fetchImpl(input.url, { headers });
    if (!response.ok) {
      return { ok: false, message: `The download was refused with HTTP ${response.status}.` };
    }
    if (!response.body) {
      return { ok: false, message: "The download returned no body." };
    }

    const handle = fs.createWriteStream(partial);
    let received = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (!handle.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => handle.once("drain", () => resolve()));
          }
          input.onProgress?.(received, input.expectedBytes);
        }
      }
    } finally {
      await new Promise<void>((resolve) => handle.end(() => resolve()));
    }

    if (received !== input.expectedBytes) {
      fs.rmSync(partial, { force: true });
      return { ok: false, bytes: received, message: `The download ended after ${received} of ${input.expectedBytes} bytes, so it was discarded rather than kept as a model.` };
    }

    fs.renameSync(partial, target);
    return { ok: true, path: target, bytes: received, message: `Downloaded ${received} bytes to ${path.basename(target)}.` };
  } catch (error) {
    fs.rmSync(partial, { force: true });
    return { ok: false, message: `The download failed: ${error instanceof Error ? error.message : "unknown error"}.` };
  }
}

/* ------------------------------------------------------------------ *
 * Execution
 * ------------------------------------------------------------------ */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ExecutionOutcome =
  | { status: "completed"; content: string; via: string; model: string }
  | { status: "failed"; error: string; via?: string; model: string };

/**
 * Run a model, locally or through a hosted endpoint.
 *
 * Both paths are real. The local path starts `llama-server` against the downloaded
 * weights; the hosted path calls Hugging Face's OpenAI-compatible Inference Providers
 * router with the user's own token. If neither is available the failure names what is
 * missing rather than returning an empty answer.
 */
export async function executeModel(input: {
  modelId: string;
  messages: ChatMessage[];
  mode: "local" | "hosted";
  /** Local: the .gguf on disk. */
  localPath?: string;
  binaryPath?: string;
  baseUrl?: string;
  contextSize?: number;
  /** Hosted: the user's Hugging Face token. */
  token?: string;
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}): Promise<ExecutionOutcome> {
  if (input.mode === "hosted") {
    if (!input.token) {
      return { status: "failed", model: input.modelId, via: "huggingface-router", error: "No Hugging Face token is stored, so the hosted endpoint cannot be called. Add one in the AI Store's token settings." };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json", "user-agent": "GeneiAI" },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: input.modelId,
          messages: input.messages,
          max_tokens: input.maxTokens ?? 1024,
          temperature: input.temperature ?? 0.7,
        }),
      });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
      if (!response.ok) {
        return { status: "failed", model: input.modelId, via: "huggingface-router", error: `The hosted endpoint answered HTTP ${response.status}: ${data?.error?.message ?? data?.error ?? raw.slice(0, 300)}` };
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return { status: "failed", model: input.modelId, via: "huggingface-router", error: "The hosted endpoint returned no message content." };
      }
      return { status: "completed", content, via: "huggingface-router", model: input.modelId };
    } catch (error) {
      return { status: "failed", model: input.modelId, via: "huggingface-router", error: `The hosted endpoint could not be reached: ${error instanceof Error ? error.message : "unknown error"}.` };
    }
  }

  // Local execution goes through the same llama.cpp adapter the rest of the platform uses.
  if (!input.localPath) {
    return { status: "failed", model: input.modelId, via: "llama.cpp", error: "This model is not downloaded, so there is nothing to run locally. Download it first, or use the hosted endpoint." };
  }
  if (!input.binaryPath) {
    return { status: "failed", model: input.modelId, via: "llama.cpp", error: "The llama.cpp runtime is not installed. Install it from the Model Library, or use the hosted endpoint." };
  }

  const { LlamaCppAdapter } = await import("./adapters/llamaCpp");
  const adapter = new LlamaCppAdapter({
    baseUrl: input.baseUrl ?? "http://127.0.0.1:8081",
    binaryPath: input.binaryPath,
    modelPath: input.localPath,
    contextSize: input.contextSize ?? 8192,
  });

  const started = await adapter.start();
  if (started.state !== "ready") {
    return { status: "failed", model: input.modelId, via: "llama.cpp", error: started.message };
  }
  try {
    const result = await adapter.chat(input.messages, { maxTokens: input.maxTokens ?? 1024, temperature: input.temperature ?? 0.7 });
    if (result.status !== "completed") {
      return { status: "failed", model: input.modelId, via: "llama.cpp", error: result.error };
    }
    return { status: "completed", content: result.content, via: "llama.cpp", model: input.modelId };
  } finally {
    adapter.stop();
  }
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/**
 * Read a stored provider token for outbound calls.
 *
 * The AI Store does not keep its own credential store: it reads the same encrypted
 * `api_keys` rows the rest of the platform uses, so a Hugging Face token saved once is
 * available everywhere and there is only one place to revoke it.
 */
export async function readProviderToken(userId: number, provider: string): Promise<string | undefined> {
  const { getDb } = await import("./db");
  const { apiKeys } = await import("../drizzle/schema");
  const { decryptSecret } = await import("./_core/keyVault");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider), eq(apiKeys.isActive, true)))
    .limit(1);
  if (!rows.length) return undefined;
  try {
    return decryptSecret(rows[0].encryptedKey);
  } catch {
    return undefined;
  }
}

/** Never returns the token itself — only whether one is stored and when it was used. */
export async function tokenStatus(userId: number, provider: string): Promise<{ configured: boolean; label?: string | null; lastUsedAt?: Date | null }> {
  const { getDb } = await import("./db");
  const { apiKeys } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return { configured: false };
  const rows = await db
    .select({ label: apiKeys.label, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider), eq(apiKeys.isActive, true)))
    .limit(1);
  return rows.length ? { configured: true, label: rows[0].label, lastUsedAt: rows[0].lastUsedAt } : { configured: false };
}
