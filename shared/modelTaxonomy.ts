/**
 * Model taxonomy — the dimensions the AI Store browses by.
 *
 * The first version classified a model into one flat capability. Research into how the
 * Hub actually organises itself showed that is too thin: a model has a **domain**, a
 * **task**, a **modality** pair, a **size class**, a **lineage**, a **licence**, a set of
 * **languages**, and a **runability** — and people browse by different ones at different
 * times. "Show me something I can run locally that reads screenshots" is a question about
 * runability and modality, not about capability.
 *
 * Everything here is derived from real Hub metadata. Where a dimension cannot be
 * determined, it says so rather than guessing.
 */
import type { CapabilityId } from "./modelCapabilities";

/* ------------------------------------------------------------------ *
 * Domain
 * ------------------------------------------------------------------ */

export const MODEL_DOMAINS = ["language", "code", "vision", "audio", "multimodal", "data", "agents", "other"] as const;
export type ModelDomain = (typeof MODEL_DOMAINS)[number];

export const DOMAIN_LABELS: Record<ModelDomain, string> = {
  language: "Language",
  code: "Code",
  vision: "Vision",
  audio: "Audio & speech",
  multimodal: "Multimodal",
  data: "Data & analysis",
  agents: "Agents & tools",
  other: "Other",
};

export const DOMAIN_DESCRIPTIONS: Record<ModelDomain, string> = {
  language: "Writing, conversation, summarising and translation.",
  code: "Writing, explaining and repairing software.",
  vision: "Reading images, screenshots and documents.",
  audio: "Speech recognition, synthesis and audio understanding.",
  multimodal: "Working across more than one kind of input at once.",
  data: "Querying, shaping and interpreting structured data.",
  agents: "Calling functions, using tools and driving workflows.",
  other: "No domain could be determined from the model's metadata.",
};

/** Which domain a capability belongs to. */
export const CAPABILITY_DOMAIN: Record<CapabilityId, ModelDomain> = {
  chat: "language",
  summarization: "language",
  translation: "language",
  "long-context": "language",
  coding: "code",
  reasoning: "language",
  math: "data",
  "data-analysis": "data",
  classification: "language",
  embeddings: "language",
  vision: "vision",
  "image-generation": "vision",
  "speech-to-text": "audio",
  "text-to-speech": "audio",
  "tool-use": "agents",
};

/* ------------------------------------------------------------------ *
 * Modality
 * ------------------------------------------------------------------ */

export const MODALITIES = ["text", "image", "audio", "video", "tabular"] as const;
export type Modality = (typeof MODALITIES)[number];

/** The pipeline tag tells us the input/output shape more reliably than anything else. */
const PIPELINE_MODALITY: Record<string, { input: Modality[]; output: Modality[] }> = {
  "text-generation": { input: ["text"], output: ["text"] },
  "text2text-generation": { input: ["text"], output: ["text"] },
  conversational: { input: ["text"], output: ["text"] },
  summarization: { input: ["text"], output: ["text"] },
  translation: { input: ["text"], output: ["text"] },
  "fill-mask": { input: ["text"], output: ["text"] },
  "text-classification": { input: ["text"], output: ["text"] },
  "token-classification": { input: ["text"], output: ["text"] },
  "zero-shot-classification": { input: ["text"], output: ["text"] },
  "feature-extraction": { input: ["text"], output: ["text"] },
  "sentence-similarity": { input: ["text"], output: ["text"] },
  "text-to-image": { input: ["text"], output: ["image"] },
  "image-to-image": { input: ["image"], output: ["image"] },
  "image-to-text": { input: ["image"], output: ["text"] },
  "image-text-to-text": { input: ["image", "text"], output: ["text"] },
  "image-classification": { input: ["image"], output: ["text"] },
  "object-detection": { input: ["image"], output: ["text"] },
  "image-segmentation": { input: ["image"], output: ["image"] },
  "depth-estimation": { input: ["image"], output: ["image"] },
  "visual-question-answering": { input: ["image", "text"], output: ["text"] },
  "document-question-answering": { input: ["image", "text"], output: ["text"] },
  "automatic-speech-recognition": { input: ["audio"], output: ["text"] },
  "audio-classification": { input: ["audio"], output: ["text"] },
  "text-to-speech": { input: ["text"], output: ["audio"] },
  "text-to-audio": { input: ["text"], output: ["audio"] },
  "audio-to-audio": { input: ["audio"], output: ["audio"] },
  "voice-activity-detection": { input: ["audio"], output: ["text"] },
  "text-to-video": { input: ["text"], output: ["video"] },
  "image-to-video": { input: ["image"], output: ["video"] },
  "video-classification": { input: ["video"], output: ["text"] },
  "tabular-classification": { input: ["tabular"], output: ["text"] },
  "tabular-regression": { input: ["tabular"], output: ["text"] },
  "time-series-forecasting": { input: ["tabular"], output: ["tabular"] },
};

export type ModalityPair = { input: Modality[]; output: Modality[]; basis?: string };

/* ------------------------------------------------------------------ *
 * Size
 * ------------------------------------------------------------------ */

export const SIZE_CLASSES = ["tiny", "small", "medium", "large", "xl", "unknown"] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const SIZE_LABELS: Record<SizeClass, string> = {
  tiny: "Tiny — under 2B",
  small: "Small — 2B to 7B",
  medium: "Medium — 7B to 20B",
  large: "Large — 20B to 70B",
  xl: "Extra large — over 70B",
  unknown: "Size not stated",
};

/** Classify by parameter count. Boundaries chosen where the memory requirement changes. */
export function sizeClassOf(parameterScale?: string): SizeClass {
  if (!parameterScale) return "unknown";
  const match = parameterScale.match(/^([\d.]+)([BM])$/);
  if (!match) return "unknown";
  const value = Number(match[1]) * (match[2] === "B" ? 1 : 0.001);
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  // Boundaries sit where the memory requirement changes, and where people actually draw
  // the line: 7B and 8B are the small consumer models, 13B is medium, 70B is the largest
  // commonly self-hosted size.
  if (value < 2) return "tiny";
  if (value < 8) return "small";
  if (value < 20) return "medium";
  if (value <= 70) return "large";
  return "xl";
}

/* ------------------------------------------------------------------ *
 * Runability
 * ------------------------------------------------------------------ */

export const RUNNABILITY = ["local-gguf", "local-runtime", "hosted-only", "adapter", "unknown"] as const;
export type Runability = (typeof RUNNABILITY)[number];

export const RUNNABILITY_LABELS: Record<Runability, string> = {
  "local-gguf": "Runs locally (GGUF)",
  "local-runtime": "Runs locally (other format)",
  "hosted-only": "Hosted only",
  adapter: "Adapter — needs a base model",
  unknown: "Runability unknown",
};

export const RUNNABILITY_DESCRIPTIONS: Record<Runability, string> = {
  "local-gguf": "A GGUF build, so llama.cpp can run it on this machine.",
  "local-runtime": "A local format, but it needs the library it was built for rather than llama.cpp.",
  "hosted-only": "No locally runnable weights were found in the repository.",
  adapter: "A LoRA or PEFT adapter: it is applied to a base model rather than run alone.",
  unknown: "Whether this can run locally could not be determined.",
};

/* ------------------------------------------------------------------ *
 * Lineage
 * ------------------------------------------------------------------ */

export const LINEAGE_RELATIONS = ["finetune", "quantized", "adapter", "merge", "base"] as const;
export type LineageRelation = (typeof LINEAGE_RELATIONS)[number];

export type Lineage = { baseModels: string[]; relation: LineageRelation };

/**
 * Read lineage from the tags the Hub uses.
 *
 * `base_model:Qwen/Qwen2.5-7B-Instruct` and
 * `base_model:quantized:Qwen/Qwen2.5-7B-Instruct` are the two forms that appear in
 * practice; the relation is inferred from the tag itself and stated rather than assumed.
 */
export function readLineage(tags: string[]): Lineage {
  const baseModels: string[] = [];
  let relation: LineageRelation = "base";
  for (const tag of tags) {
    const match = tag.match(/^base_model:(?:(finetune|quantized|adapter|merge|peft):)?(.+)$/i);
    if (!match) continue;
    const [, kind, model] = match;
    if (model && !baseModels.includes(model)) baseModels.push(model);
    if (kind) relation = kind.toLowerCase() === "peft" ? "adapter" : (kind.toLowerCase() as LineageRelation);
    else if (relation === "base") relation = "finetune";
  }
  if (baseModels.length > 1) relation = "merge";
  return { baseModels, relation };
}

/* ------------------------------------------------------------------ *
 * Licence
 * ------------------------------------------------------------------ */

export type Licence = { id: string; permissive: boolean; note?: string };

/**
 * Licences that are genuinely permissive for commercial use, and the ones that are not.
 *
 * This is a real distinction users care about, and getting it wrong has legal
 * consequences, so anything not on the permissive list is reported as "check the terms"
 * rather than being implied to be safe.
 */
const PERMISSIVE = new Set(["apache-2.0", "mit", "bsd-3-clause", "bsd-2-clause", "isc", "cc0-1.0", "unlicense", "wtfpl", "zlib", "openrail"]);
const RESTRICTED = new Set(["llama2", "llama3", "llama3.1", "llama3.2", "llama3.3", "gemma", "cc-by-nc-4.0", "cc-by-nc-sa-4.0", "non-commercial"]);

export function readLicence(tags: string[], cardData?: Record<string, unknown>): Licence {
  const fromCard = typeof cardData?.license === "string" ? cardData.license : undefined;
  const fromTag = tags.find((tag) => /^license:/i.test(tag))?.replace(/^license:/i, "");
  const id = (fromCard ?? fromTag ?? "unknown").toLowerCase();
  if (id === "unknown") return { id, permissive: false, note: "No licence is declared in the model card, so the terms are unknown. Check the repository before commercial use." };
  if (PERMISSIVE.has(id)) return { id, permissive: true };
  if (RESTRICTED.has(id)) return { id, permissive: false, note: `${id} carries usage conditions. Read the licence before commercial use.` };
  return { id, permissive: false, note: `${id} is not on the permissive list, so its terms have not been assumed to be permissive. Read the licence.` };
}

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;
const NON_LANGUAGE_TAGS = new Set(["en", "code", "math"]);

/** Language tags are bare ISO codes; everything else in the tag list is not a language. */
export function readLanguages(tags: string[]): string[] {
  const found: string[] = [];
  for (const tag of tags) {
    if (tag.includes(":") || tag.includes("/")) continue;
    if (!LANGUAGE_CODE.test(tag)) continue;
    if (NON_LANGUAGE_TAGS.has(tag) && tag !== "en") continue;
    const code = tag.toLowerCase();
    if (!found.includes(code)) found.push(code);
  }
  return found.sort();
}

/* ------------------------------------------------------------------ *
 * The full categorisation
 * ------------------------------------------------------------------ */

export type ModelCategory = {
  domain: ModelDomain;
  domains: ModelDomain[];
  modality: ModalityPair;
  sizeClass: SizeClass;
  runability: Runability;
  lineage: Lineage;
  licence: Licence;
  languages: string[];
  /** Which dimensions could not be determined, so the UI can say so. */
  unknown: string[];
};

export type CategoryInput = {
  id: string;
  pipelineTag?: string;
  tags?: string[];
  cardData?: Record<string, unknown>;
  /** Whether the repository contains a GGUF build. */
  hasGguf?: boolean;
  /** Whether the repository contains a non-GGUF weight file. */
  hasOtherWeights?: boolean;
  parameterScale?: string;
  capabilities: Array<{ id: CapabilityId }>;
};

/** Build the full categorisation from real metadata. */
export function categorise(input: CategoryInput): ModelCategory {
  const tags = input.tags ?? [];
  const pipeline = input.pipelineTag?.toLowerCase();
  const unknown: string[] = [];

  const domains: ModelDomain[] = [];
  for (const capability of input.capabilities) {
    const domain = CAPABILITY_DOMAIN[capability.id];
    if (domain && !domains.includes(domain)) domains.push(domain);
  }

  const pipelineModality = pipeline ? PIPELINE_MODALITY[pipeline] : undefined;
  let modality: ModalityPair;
  if (pipelineModality) {
    modality = { ...pipelineModality, basis: `Hugging Face pipeline tag "${pipeline}"` };
  } else {
    const hasImage = tags.some((tag) => /^(vision|image|multimodal)/i.test(tag));
    const hasAudio = tags.some((tag) => /^(audio|speech|asr)/i.test(tag));
    if (hasImage) modality = { input: ["image", "text"], output: ["text"], basis: "vision-related tag" };
    else if (hasAudio) modality = { input: ["audio"], output: ["text"], basis: "audio-related tag" };
    else if (domains.includes("language") || domains.includes("code")) modality = { input: ["text"], output: ["text"], basis: "text capability" };
    else {
      modality = { input: [], output: [] };
      unknown.push("modality");
    }
  }

  // Multimodal is a claim about the model, not about the domain count.
  if (modality.input.length > 1 && !domains.includes("multimodal")) domains.push("multimodal");
  if (domains.length === 0) domains.push("other");

  const lineage = readLineage(tags);

  let runability: Runability;
  if (lineage.relation === "adapter") runability = "adapter";
  else if (input.hasGguf) runability = "local-gguf";
  else if (input.hasOtherWeights) runability = "local-runtime";
  else runability = "unknown";

  const sizeClass = sizeClassOf(input.parameterScale);
  if (sizeClass === "unknown") unknown.push("size");

  const licence = readLicence(tags, input.cardData);
  if (licence.id === "unknown") unknown.push("licence");

  const languages = readLanguages(tags);

  return {
    domain: domains[0],
    domains,
    modality,
    sizeClass,
    runability,
    lineage,
    licence,
    languages,
    unknown,
  };
}
