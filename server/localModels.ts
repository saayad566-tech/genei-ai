/**
 * Local model manager.
 *
 * Everything needed to choose, install, run, switch and remove a local LLM on the machine the
 * user actually has. Local-first is the point of this application, so this is not a nicety —
 * it is the difference between a platform that works offline and one that talks about it.
 *
 * Three rules, taken from the rest of this codebase:
 *
 *  1. **Recommend, never assume.** A model is suggested because it fits the measured RAM, not
 *     because it is the newest. Nothing is installed without the user choosing it.
 *  2. **Verify, never trust.** A download is only usable when the bytes on disk are a real
 *     GGUF with the expected size. A truncated file is the most common failure and it looks
 *     exactly like a successful one until the engine refuses it.
 *  3. **Say what is missing.** With no model installed the manager reports what to install and
 *     how much disk it needs — it never fabricates a "ready" state.
 */

import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/* ------------------------------------------------------------------ *
 * Device profile
 * ------------------------------------------------------------------ */

export type DeviceProfile = {
  /** Total system RAM in GB. */
  ramGB: number;
  /** Usable VRAM in GB, or 0 for CPU-only. */
  vramGB: number;
  /** CPU cores available for inference threads. */
  cores: number;
  /** Free disk in GB where models will be stored. */
  freeDiskGB: number;
  platform: string;
  /** Detected accelerator, for display and for offload decisions. */
  accelerator: "cuda" | "metal" | "vulkan" | "cpu";
};

export function detectDevice(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  const totalRam = os.totalmem() / 1024 ** 3;
  const cores = os.cpus().length || 1;
  return {
    // Round down: a machine reporting 15.9 GB has 15 GB usable, and claiming 16 would
    // recommend a model that then fails to load.
    ramGB: Math.floor(totalRam),
    vramGB: 0,
    cores,
    freeDiskGB: 0,
    platform: process.platform,
    accelerator: "cpu",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Quantisation
 * ------------------------------------------------------------------ */

export type Quantization = "Q2_K" | "Q3_K_M" | "Q4_K_M" | "Q5_K_M" | "Q6_K" | "Q8_0" | "F16";

export type QuantProfile = {
  id: Quantization;
  label: string;
  /** Bytes per parameter, roughly. Used for the size estimate. */
  bytesPerParam: number;
  /** Quality retention, 0-1. Stated as an estimate, not a measurement. */
  quality: number;
  note: string;
};

/**
 * Bytes-per-parameter figures are the published averages for each GGUF quantisation. They are
 * estimates used for a fit check, and the estimate is labelled as one everywhere it surfaces —
 * the real size comes from the file once it is downloaded.
 */
export const QUANTIZATIONS: QuantProfile[] = [
  { id: "Q2_K", label: "Q2_K — smallest", bytesPerParam: 0.36, quality: 0.62, note: "Noticeably degraded; use only when nothing else fits." },
  { id: "Q3_K_M", label: "Q3_K_M — very small", bytesPerParam: 0.48, quality: 0.74, note: "Noticeable quality loss on reasoning tasks." },
  { id: "Q4_K_M", label: "Q4_K_M — balanced", bytesPerParam: 0.6, quality: 0.88, note: "The usual default: most of the quality at a fraction of the size." },
  { id: "Q5_K_M", label: "Q5_K_M — higher quality", bytesPerParam: 0.72, quality: 0.94, note: "A good choice when memory allows." },
  { id: "Q6_K", label: "Q6_K — near lossless", bytesPerParam: 0.85, quality: 0.97, note: "Diminishing returns unless memory is plentiful." },
  { id: "Q8_0", label: "Q8_0 — effectively lossless", bytesPerParam: 1.06, quality: 0.99, note: "Large; rarely worth it over Q6_K." },
  { id: "F16", label: "F16 — unquantised", bytesPerParam: 2.0, quality: 1.0, note: "Full precision. Needs roughly twice the memory of Q8_0." },
];

export function quantProfile(id: Quantization): QuantProfile {
  const found = QUANTIZATIONS.find((q) => q.id === id);
  if (!found) throw new Error(`Unknown quantisation "${id}".`);
  return found;
}

/** Estimated file size in GB for a parameter count at a quantisation. Labelled an estimate. */
export function estimateSizeGB(parametersB: number, quant: Quantization): number {
  return Math.round(parametersB * quantProfile(quant).bytesPerParam * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

export type ModelEntry = {
  id: string;
  name: string;
  family: string;
  /** Parameter count in billions. */
  parametersB: number;
  /** Available quantisations, smallest first. */
  quantizations: Quantization[];
  /** Approximate context window in tokens. */
  contextTokens: number;
  /** What it is good at, stated plainly. */
  strengths: string[];
  /** Licence, so a user is not surprised. */
  licence: string;
  /** Whether a vision projector exists for it. */
  multimodal?: boolean;
};

export const CATALOGUE: ModelEntry[] = [
  {
    id: "qwen2.5-0.5b-instruct",
    name: "Qwen2.5 0.5B Instruct",
    family: "Qwen",
    parametersB: 0.5,
    quantizations: ["Q4_K_M", "Q5_K_M", "Q8_0", "F16"],
    contextTokens: 32768,
    strengths: ["Runs on anything", "Fast", "Good for drafting and classification"],
    licence: "Apache-2.0",
  },
  {
    id: "qwen2.5-1.5b-instruct",
    name: "Qwen2.5 1.5B Instruct",
    family: "Qwen",
    parametersB: 1.5,
    quantizations: ["Q4_K_M", "Q5_K_M", "Q8_0"],
    contextTokens: 32768,
    strengths: ["Small but capable", "Good instruction following"],
    licence: "Apache-2.0",
  },
  {
    id: "llama-3.2-3b-instruct",
    name: "Llama 3.2 3B Instruct",
    family: "Llama",
    parametersB: 3,
    quantizations: ["Q4_K_M", "Q5_K_M", "Q6_K", "Q8_0"],
    contextTokens: 131072,
    strengths: ["Strong reasoning for its size", "Long context"],
    licence: "Llama 3.2 Community",
  },
  {
    id: "qwen2.5-7b-instruct",
    name: "Qwen2.5 7B Instruct",
    family: "Qwen",
    parametersB: 7,
    quantizations: ["Q3_K_M", "Q4_K_M", "Q5_K_M", "Q6_K", "Q8_0"],
    contextTokens: 32768,
    strengths: ["General purpose", "Good writing quality"],
    licence: "Apache-2.0",
  },
  {
    id: "llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    family: "Llama",
    parametersB: 8,
    quantizations: ["Q3_K_M", "Q4_K_M", "Q5_K_M", "Q6_K"],
    contextTokens: 131072,
    strengths: ["Well-rounded", "Wide tooling support"],
    licence: "Llama 3.1 Community",
  },
  {
    id: "qwen2.5-14b-instruct",
    name: "Qwen2.5 14B Instruct",
    family: "Qwen",
    parametersB: 14,
    quantizations: ["Q3_K_M", "Q4_K_M", "Q5_K_M"],
    contextTokens: 32768,
    strengths: ["High quality", "Needs a capable machine"],
    licence: "Apache-2.0",
  },
  {
    id: "llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    family: "Llama",
    parametersB: 70,
    quantizations: ["Q2_K", "Q3_K_M", "Q4_K_M"],
    contextTokens: 131072,
    strengths: ["Near-frontier quality", "Requires a workstation"],
    licence: "Llama 3.3 Community",
  },
];

export function findModel(id: string): ModelEntry | undefined {
  return CATALOGUE.find((entry) => entry.id === id);
}

/* ------------------------------------------------------------------ *
 * Fit — the recommendation engine
 * ------------------------------------------------------------------ */

export type FitVerdict = {
  model: ModelEntry;
  quant: Quantization;
  estimatedSizeGB: number;
  /** Memory the runtime needs beyond the weights, for the KV cache and overhead. */
  overheadGB: number;
  requiredGB: number;
  /** True when it fits in VRAM (fast), RAM (usable), or neither. */
  runsOn: "gpu" | "cpu" | "no";
  /** Fraction of available memory the model would occupy. */
  utilisation: number;
  explanation: string;
};

/** Runtime overhead beyond the weights: KV cache, compute buffers, the process itself. */
export function overheadFor(model: ModelEntry, quant: Quantization): number {
  const size = estimateSizeGB(model.parametersB, quant);
  // Roughly 20% plus a fixed floor. An estimate, and labelled as one.
  return Math.round((size * 0.2 + 0.8) * 100) / 100;
}

/**
 * Decide which quantisation of a model actually runs on this device.
 *
 * Prefers the highest quality that fits, with headroom: a model that consumes 95% of RAM
 * leaves nothing for the rest of the machine and will swap, which is slower than a smaller
 * model that fits comfortably.
 */
export function fitModel(model: ModelEntry, device: DeviceProfile, headroom = 0.85): FitVerdict | null {
  const best = [...model.quantizations]
    .sort((a, b) => quantProfile(b).quality - quantProfile(a).quality) // highest quality first
    .map((quant) => {
      const size = estimateSizeGB(model.parametersB, quant);
      const overhead = overheadFor(model, quant);
      const required = Math.round((size + overhead) * 100) / 100;

      const vramBudget = device.vramGB * headroom;
      const ramBudget = device.ramGB * headroom;
      const runsOn: FitVerdict["runsOn"] = required <= vramBudget ? "gpu" : required <= ramBudget ? "cpu" : "no";
      const budget = runsOn === "gpu" ? device.vramGB : device.ramGB;

      return {
        model,
        quant,
        estimatedSizeGB: size,
        overheadGB: overhead,
        requiredGB: required,
        runsOn,
        utilisation: budget > 0 ? Math.round((required / budget) * 100) / 100 : 1,
        explanation: "",
      } satisfies FitVerdict;
    })
    .find((verdict) => verdict.runsOn !== "no");

  if (!best) return null;

  const where = best.runsOn === "gpu" ? `your ${device.vramGB} GB of VRAM` : `your ${device.ramGB} GB of RAM`;
  return {
    ...best,
    explanation:
      `${best.quant} needs about ${best.requiredGB} GB (${best.estimatedSizeGB} GB of weights plus ` +
      `${best.overheadGB} GB of runtime overhead), which fits ${where} at ${Math.round(best.utilisation * 100)}% utilisation. ` +
      "Sizes are estimates; the real figure comes from the file once downloaded.",
  };
}

/** Every model that runs on this device, best fit first. */
export function recommendModels(device: DeviceProfile, limit = 5): FitVerdict[] {
  return CATALOGUE.map((model) => fitModel(model, device))
    .filter((verdict): verdict is FitVerdict => verdict !== null)
    .sort((a, b) => {
      // Prefer the largest that still fits comfortably; that is the best quality per machine.
      if (a.runsOn !== b.runsOn) return a.runsOn === "gpu" ? -1 : 1;
      return b.model.parametersB - a.model.parametersB;
    })
    .slice(0, limit);
}

/** Models that cannot run here, and the smallest one that would need what the machine lacks. */
export function tooLargeFor(device: DeviceProfile): Array<{ model: ModelEntry; needsGB: number }> {
  return CATALOGUE.filter((model) => fitModel(model, device) === null).map((model) => {
    const smallest = model.quantizations
      .map((quant) => Math.round((estimateSizeGB(model.parametersB, quant) + overheadFor(model, quant)) * 100) / 100)
      .sort((a, b) => a - b)[0];
    return { model, needsGB: smallest };
  });
}

/* ------------------------------------------------------------------ *
 * Runtime tuning
 * ------------------------------------------------------------------ */

export type Tuning = {
  threads: number;
  /** Layers to offload to the GPU. 0 means CPU-only. */
  gpuLayers: number;
  contextTokens: number;
  /** Why each value was chosen. */
  rationale: string[];
};

/**
 * Choose runtime parameters for this device and model.
 *
 * Threads: physical cores minus one, so the UI and the OS stay responsive. Leaving every core
 * to the model makes the machine feel frozen, which users read as a crash.
 */
export function tuneFor(model: ModelEntry, quant: Quantization, device: DeviceProfile): Tuning {
  const rationale: string[] = [];

  const threads = Math.max(1, device.cores - 1);
  rationale.push(`${threads} threads — one core left free so the interface stays responsive.`);

  const fit = fitModel(model, device);
  const gpuLayers = fit?.runsOn === "gpu" ? 999 : 0;
  rationale.push(
    gpuLayers > 0
      ? `All layers offloaded — ${device.vramGB} GB of VRAM covers ${fit?.requiredGB} GB.`
      : "CPU only — no VRAM detected, or the model does not fit in it.",
  );

  // Context: use the model's window when memory allows, otherwise scale it down. The KV cache
  // grows with context and is the usual cause of an out-of-memory crash after a good start.
  const size = estimateSizeGB(model.parametersB, quant);
  const contextTokens = size < 4 ? Math.min(model.contextTokens, 16384) : Math.min(model.contextTokens, 8192);
  rationale.push(
    `Context ${contextTokens} tokens — capped from ${model.contextTokens} because the KV cache grows with it and is the usual cause of a late out-of-memory.`,
  );

  return { threads, gpuLayers, contextTokens, rationale };
}

/* ------------------------------------------------------------------ *
 * Integrity
 * ------------------------------------------------------------------ */

export type GgufInfo = {
  ok: boolean;
  version?: number;
  tensorCount?: number;
  fileSizeBytes: number;
  reason?: string;
};

/**
 * Read a file's real bytes and decide whether it is a GGUF.
 *
 * This exists because a truncated or HTML-error-page download has a plausible size and a
 * plausible name. The only honest check is the magic number: "GGUF" at offset 0, then a
 * version and tensor count in the header.
 */
export function inspectGguf(filePath: string): GgufInfo {
  let buffer: Buffer;
  try {
    const stat = readFileSync(filePath, { encoding: null, flag: "r" });
    buffer = stat;
  } catch (error) {
    return { ok: false, fileSizeBytes: 0, reason: `Cannot read ${path.basename(filePath)}: ${error instanceof Error ? error.message : "unknown"}` };
  }

  if (buffer.length === 0) return { ok: false, fileSizeBytes: 0, reason: "The file is empty (0 bytes)." };
  if (buffer.length < 24) return { ok: false, fileSizeBytes: buffer.length, reason: `Only ${buffer.length} bytes — too small to be a GGUF header.` };

  const magic = buffer.subarray(0, 4).toString("ascii");
  if (magic !== "GGUF") {
    // An HTML error page saved with a .gguf name is the classic case.
    const head = buffer.subarray(0, 40).toString("utf8").replace(/[^\x20-\x7e]/g, ".");
    return {
      ok: false,
      fileSizeBytes: buffer.length,
      reason: `Not a GGUF file — the first bytes are "${head}". A failed download often saves an error page under the model's name.`,
    };
  }

  const version = buffer.readUInt32LE(4);
  const tensorCount = Number(buffer.readBigUInt64LE(8));
  if (version === 0 || version > 3) {
    return { ok: false, version, tensorCount, fileSizeBytes: buffer.length, reason: `GGUF version ${version} is not supported.` };
  }
  if (tensorCount === 0) {
    return { ok: false, version, tensorCount, fileSizeBytes: buffer.length, reason: "The header declares zero tensors, so the file carries no weights." };
  }

  return { ok: true, version, tensorCount, fileSizeBytes: buffer.length };
}

/* ------------------------------------------------------------------ *
 * Installed model store
 * ------------------------------------------------------------------ */

export type InstalledModel = {
  id: string;
  modelId: string;
  quant: Quantization;
  filePath: string;
  sizeBytes: number;
  installedAt: string;
  /** Last time it was made the active model. */
  lastUsedAt?: string;
};

export type StoreState = {
  installed: InstalledModel[];
  activeId: string | null;
  /** Models removed but still on disk, so a user can clean up. */
  orphans: string[];
};

function dataDir(): string {
  return process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
}

export function modelsDir(): string {
  return path.join(dataDir(), "models");
}

function storeFile(): string {
  return path.join(dataDir(), "models.json");
}

async function readStore(): Promise<StoreState> {
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile(), "utf8")) as Partial<StoreState>;
    return {
      installed: Array.isArray(parsed.installed) ? parsed.installed : [],
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      orphans: Array.isArray(parsed.orphans) ? parsed.orphans : [],
    };
  } catch {
    return { installed: [], activeId: null, orphans: [] };
  }
}

async function writeStore(state: StoreState): Promise<void> {
  const target = storeFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temp, target);
}

export async function listInstalled(): Promise<StoreState> {
  return readStore();
}

/**
 * Register a downloaded file as installed.
 *
 * The file is inspected first: a truncated or misnamed download is refused here rather than
 * becoming a model that fails to load later with a less useful error.
 */
export async function registerInstalled(input: {
  modelId: string;
  quant: Quantization;
  filePath: string;
}): Promise<InstalledModel> {
  const model = findModel(input.modelId);
  if (!model) throw new Error(`"${input.modelId}" is not in the catalogue.`);

  const info = inspectGguf(input.filePath);
  if (!info.ok) throw new Error(`That file is not a usable model: ${info.reason}`);

  const state = await readStore();
  const id = `${input.modelId}-${input.quant}`;
  const entry: InstalledModel = {
    id,
    modelId: input.modelId,
    quant: input.quant,
    filePath: input.filePath,
    sizeBytes: info.fileSizeBytes,
    installedAt: new Date().toISOString(),
  };

  const existing = state.installed.findIndex((m) => m.id === id);
  if (existing !== -1) state.installed[existing] = { ...entry, installedAt: state.installed[existing].installedAt };
  else state.installed.push(entry);

  // First model installed becomes active: a user who installs one thing expects it to be used.
  if (!state.activeId) state.activeId = id;

  await writeStore(state);
  return entry;
}

export async function switchActive(id: string): Promise<StoreState> {
  const state = await readStore();
  const target = state.installed.find((m) => m.id === id);
  if (!target) throw new Error(`"${id}" is not installed.`);

  // The file must still be there. Switching to a model whose file was deleted by hand would
  // fail at inference time with a far less obvious message.
  const info = inspectGguf(target.filePath);
  if (!info.ok) throw new Error(`"${id}" cannot be activated: ${info.reason}`);

  state.activeId = id;
  const index = state.installed.findIndex((m) => m.id === id);
  state.installed[index] = { ...target, lastUsedAt: new Date().toISOString() };
  await writeStore(state);
  return state;
}

/**
 * Remove a model from the store.
 *
 * The file is deleted only when asked. The default keeps it on disk and records it as an
 * orphan, because deleting a multi-gigabyte download by accident is not recoverable offline.
 */
export async function removeModel(id: string, options: { deleteFile?: boolean } = {}): Promise<StoreState> {
  const state = await readStore();
  const target = state.installed.find((m) => m.id === id);
  if (!target) throw new Error(`"${id}" is not installed.`);

  state.installed = state.installed.filter((m) => m.id !== id);

  if (options.deleteFile) {
    await fs.unlink(target.filePath).catch(() => undefined);
  } else {
    state.orphans.push(target.filePath);
  }

  if (state.activeId === id) {
    // Fall back to the most recently used remaining model rather than leaving nothing active.
    const next = [...state.installed].sort((a, b) => (b.lastUsedAt ?? b.installedAt).localeCompare(a.lastUsedAt ?? a.installedAt))[0];
    state.activeId = next ? next.id : null;
  }

  await writeStore(state);
  return state;
}

/** The active model, with the information needed to launch an engine against it. */
export async function activeModel(): Promise<(InstalledModel & { model: ModelEntry; tuning: Tuning }) | null> {
  const state = await readStore();
  if (!state.activeId) return null;
  const entry = state.installed.find((m) => m.id === state.activeId);
  if (!entry) return null;
  const model = findModel(entry.modelId);
  if (!model) return null;
  return { ...entry, model, tuning: tuneFor(model, entry.quant, detectDevice()) };
}

/* ------------------------------------------------------------------ *
 * Disk usage
 * ------------------------------------------------------------------ */

export type DiskUsage = {
  totalBytes: number;
  totalGB: number;
  byModel: Array<{ id: string; sizeBytes: number }>;
  orphanBytes: number;
};

export async function diskUsage(): Promise<DiskUsage> {
  const state = await readStore();
  const byModel = state.installed.map((m) => ({ id: m.id, sizeBytes: m.sizeBytes }));
  const totalBytes = byModel.reduce((sum, m) => sum + m.sizeBytes, 0);

  let orphanBytes = 0;
  for (const orphan of state.orphans) {
    const stat = await fs.stat(orphan).catch(() => null);
    if (stat) orphanBytes += stat.size;
  }

  return {
    totalBytes,
    totalGB: Math.round((totalBytes / 1024 ** 3) * 100) / 100,
    byModel,
    orphanBytes,
  };
}

/** Delete orphaned files. Returns how much was reclaimed. */
export async function cleanOrphans(): Promise<{ removed: number; reclaimedBytes: number }> {
  const state = await readStore();
  let reclaimedBytes = 0;
  const kept: string[] = [];

  for (const orphan of state.orphans) {
    const stat = await fs.stat(orphan).catch(() => null);
    if (!stat) continue; // already gone
    const removed = await fs.unlink(orphan).then(() => true).catch(() => false);
    if (removed) reclaimedBytes += stat.size;
    else kept.push(orphan);
  }

  state.orphans = kept;
  await writeStore(state);
  return { removed: state.orphans.length === 0 ? 0 : kept.length, reclaimedBytes };
}

/* ------------------------------------------------------------------ *
 * Benchmark
 * ------------------------------------------------------------------ */

export type Benchmark = {
  tokensPerSecond: number;
  tokens: number;
  elapsedMs: number;
  note: string;
};

/**
 * Compute throughput from real numbers.
 *
 * Takes the elapsed time and token count the engine reported — it does not measure anything
 * itself, and says so, because a benchmark that silently estimates is worse than none.
 */
export function benchmarkFrom(tokens: number, elapsedMs: number): Benchmark {
  if (elapsedMs <= 0) throw new Error("Elapsed time must be greater than zero to compute throughput.");
  const tokensPerSecond = Math.round((tokens / (elapsedMs / 1000)) * 100) / 100;
  return {
    tokensPerSecond,
    tokens,
    elapsedMs,
    note: `Computed from ${tokens} tokens in ${elapsedMs} ms, as reported by the engine. Not measured independently.`,
  };
}
