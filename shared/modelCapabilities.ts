/**
 * Model capability taxonomy and classifier.
 *
 * The AI Store has to answer one question well: *what is this model actually for?*
 * A store that guesses is worse than one that says nothing, so every capability here
 * carries the **basis** that produced it — the pipeline tag, the tag, or the name
 * pattern that matched — and a confidence. Nothing is inferred from vibes.
 *
 * Shared between the server (which classifies) and the client (which displays the
 * basis), so the two can never disagree about why a model was labelled.
 */

export const CAPABILITY_IDS = [
  "chat",
  "coding",
  "reasoning",
  "summarization",
  "translation",
  "data-analysis",
  "math",
  "vision",
  "speech-to-text",
  "text-to-speech",
  "image-generation",
  "embeddings",
  "classification",
  "long-context",
  "tool-use",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/**
 * Normalise the Hub's `tags` into a clean string array.
 *
 * The API documents `tags` as an array of strings, but it does not always deliver that:
 * a single string has been observed where an array was expected, and entries can be null.
 * `tags ?? []` does not help in either case — a string is not nullish, and it has no
 * `.find`, so the guard silently fails and the call throws on live data.
 *
 * Every consumer goes through here instead, so the shape is settled once.
 */
export function normaliseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  if (typeof tags === "string" && tags.length > 0) return [tags];
  return [];
}

export type CapabilitySignal = {
  id: CapabilityId;
  /** 0–1. Higher means a more direct signal produced it. */
  confidence: number;
  /** Exactly which signal matched, so the label can be checked rather than trusted. */
  basis: string;
};

export type ModelMeta = {
  id: string;
  pipelineTag?: string;
  tags?: string[];
  cardData?: Record<string, unknown>;
  downloads?: number;
  likes?: number;
  gated?: boolean | string;
  disabled?: boolean;
  /** Hugging Face returns this for GGUF repositories. */
  gguf?: unknown;
};

export type CapabilityProfile = {
  /** The single best-supported capability, or "general" when nothing matched. */
  primary: CapabilityId | "general";
  capabilities: CapabilitySignal[];
  /** e.g. "7B" — read from the model name, which is the only reliable place for it. */
  parameterScale?: string;
  /** e.g. "Q4_K_M" — read from the repository's GGUF metadata or name. */
  quantization?: string;
  contextLength?: number;
  /** Anything the user should know before relying on the label. */
  notes: string[];
};

/**
 * Pipeline tags that almost every language model carries. They say "this generates
 * text", which is true of nearly every LLM, so they must not outrank a specific signal:
 * a model tagged `code` or named `Coder` is a coding model even though its pipeline tag
 * is the generic `text-generation`.
 */
const GENERIC_PIPELINES = new Set(["text-generation", "text2text-generation", "conversational", "fill-mask"]);

/** Pipeline tags are Hugging Face's own classification. Specific ones are the strongest signal. */
const PIPELINE_MAP: Record<string, CapabilityId> = {
  "text-generation": "chat",
  "text2text-generation": "chat",
  "conversational": "chat",
  "summarization": "summarization",
  "translation": "translation",
  "automatic-speech-recognition": "speech-to-text",
  "text-to-speech": "text-to-speech",
  "text-to-image": "image-generation",
  "image-to-text": "vision",
  "image-text-to-text": "vision",
  "visual-question-answering": "vision",
  "image-classification": "vision",
  "feature-extraction": "embeddings",
  "sentence-similarity": "embeddings",
  "text-classification": "classification",
  "token-classification": "classification",
  "zero-shot-classification": "classification",
  "fill-mask": "chat",
};

/** Tag patterns, in the order they are worth trusting. */
const TAG_RULES: Array<{ match: RegExp; id: CapabilityId; confidence: number }> = [
  { match: /^(code|codeqwen|coding|starcoder|codegen)/i, id: "coding", confidence: 0.85 },
  { match: /(math|mathstral|deepseek-?math)/i, id: "math", confidence: 0.8 },
  { match: /(reasoning|chain-of-thought|grpo)/i, id: "reasoning", confidence: 0.75 },
  { match: /(function-calling|tool-use|tool-calling|agents)/i, id: "tool-use", confidence: 0.8 },
  { match: /(long-context|longcontext|128k|1m-context)/i, id: "long-context", confidence: 0.75 },
  { match: /(sql|pandas|tabular|data-analysis|analytics)/i, id: "data-analysis", confidence: 0.75 },
  { match: /(vision|multimodal|visual|vlm)/i, id: "vision", confidence: 0.75 },
  { match: /(whisper|speech|asr|audio)/i, id: "speech-to-text", confidence: 0.7 },
  { match: /(tts|text-to-speech|speech-synthesis|vocoder)/i, id: "text-to-speech", confidence: 0.7 },
  { match: /(diffusion|text-to-image|stable-diffusion|flux)/i, id: "image-generation", confidence: 0.8 },
  { match: /(embedding|sentence-transformers|bge|e5-)/i, id: "embeddings", confidence: 0.85 },
  { match: /(summariz)/i, id: "summarization", confidence: 0.8 },
  { match: /(translat|nllb|opus-mt)/i, id: "translation", confidence: 0.8 },
  { match: /(instruct|chat|conversational)/i, id: "chat", confidence: 0.7 },
];

/**
 * Name patterns are the weakest signal but the only one available for many community
 * repositories, which carry almost no tags. Confidence reflects that.
 */
const NAME_RULES: Array<{ match: RegExp; id: CapabilityId; confidence: number }> = [
  { match: /(coder|code-|-code|codegen|starcoder|deepseek-coder)/i, id: "coding", confidence: 0.6 },
  { match: /(math|calc)/i, id: "math", confidence: 0.55 },
  { match: /(r1|reason|thinking|qwq)/i, id: "reasoning", confidence: 0.5 },
  { match: /(vision|vl-|-vl|llava|qwen-vl|pixtral)/i, id: "vision", confidence: 0.6 },
  { match: /(whisper|wav2vec|parakeet)/i, id: "speech-to-text", confidence: 0.7 },
  { match: /(tts|speecht5|bark|xtts)/i, id: "text-to-speech", confidence: 0.6 },
  { match: /(embed|bge|gte|e5)/i, id: "embeddings", confidence: 0.6 },
  { match: /(instruct|chat)/i, id: "chat", confidence: 0.5 },
  { match: /(summar)/i, id: "summarization", confidence: 0.5 },
];

/** Used only to break ties between equally-confident capabilities. */
const PRIORITY: CapabilityId[] = [
  "coding", "vision", "speech-to-text", "text-to-speech", "image-generation",
  "embeddings", "math", "reasoning", "data-analysis", "tool-use",
  "translation", "summarization", "long-context", "classification", "chat",
];

function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** "Qwen2.5-Coder-7B-Instruct" -> "7B". Read from the name; nothing else is reliable. */
export function readParameterScale(id: string | undefined | null): string | undefined {
  // A missing id is a missing answer, not a crash.
  if (typeof id !== "string" || id.length === 0) return undefined;
  const match = id.match(/(\d+(?:\.\d+)?)\s*[xX]?\s*([BM])\b/);
  if (!match) return undefined;
  // Guard the parse itself: a wild id must not produce NaN downstream.
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return `${match[1]}${match[2].toUpperCase()}`;
}

/** "…-Q4_K_M.gguf" or a gguf metadata block -> "Q4_K_M". */
export function readQuantization(meta: ModelMeta | undefined | null): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const fromName = typeof meta.id === "string"
    ? meta.id.match(/(Q\d(?:_[A-Z0-9]+)*|IQ\d(?:_[A-Z0-9]+)*|F16|F32|BF16)/i)
    : null;
  if (fromName) return fromName[1].toUpperCase();
  const gguf = meta.gguf as Record<string, unknown> | undefined;
  const quant = readString(gguf, "quantization") ?? readString(gguf, "quant_method");
  if (quant) return quant;
  return normaliseTags(meta.tags).find((entry) => /^quant/i.test(entry));
}

function readContextLength(meta: ModelMeta): number | undefined {
  const card = meta.cardData ?? {};
  for (const key of ["context_length", "max_position_embeddings", "n_ctx", "max_length"]) {
    const value = card[key];
    if (typeof value === "number" && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  const fromName = meta.id.match(/(\d+)[kK]-?(?:context|ctx)/);
  return fromName ? Number(fromName[1]) * 1024 : undefined;
}

/**
 * Classify a model from its real metadata.
 *
 * Every returned capability names the signal behind it. If nothing matches, the result
 * is `primary: "general"` with a note — never a guess dressed up as a label.
 */
export function classifyModel(meta: ModelMeta): CapabilityProfile {
  const signals = new Map<CapabilityId, CapabilitySignal>();
  const notes: string[] = [];

  const record = (id: CapabilityId, confidence: number, basis: string) => {
    const existing = signals.get(id);
    // Keep the strongest evidence for each capability, not the last one seen.
    if (!existing || confidence > existing.confidence) signals.set(id, { id, confidence, basis });
  };

  const pipeline = meta.pipelineTag?.toLowerCase();
  if (pipeline && PIPELINE_MAP[pipeline]) {
    // A specific pipeline tag (summarisation, ASR, translation) is decisive. A generic
    // one is recorded weakly, so a real signal can outrank it.
    const generic = GENERIC_PIPELINES.has(pipeline);
    record(
      PIPELINE_MAP[pipeline],
      generic ? 0.45 : 0.9,
      generic
        ? `Hugging Face pipeline tag "${pipeline}" (generic — most language models carry it, so it is weighted below any specific signal)`
        : `Hugging Face pipeline tag "${pipeline}"`,
    );
  } else if (pipeline) {
    notes.push(`The pipeline tag "${pipeline}" has no mapping here, so it did not set a capability.`);
  }

  for (const tag of normaliseTags(meta.tags)) {
    const clean = tag.replace(/^license:/i, "license:").trim();
    for (const rule of TAG_RULES) {
      if (rule.match.test(clean)) {
        record(rule.id, rule.confidence, `Tag "${tag}"`);
        break;
      }
    }
  }

  const shortName = meta.id.split("/").pop() ?? meta.id;
  for (const rule of NAME_RULES) {
    if (rule.match.test(shortName)) {
      record(rule.id, rule.confidence, `Name pattern in "${shortName}"`);
      break;
    }
  }

  const capabilities = Array.from(signals.values()).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id);
  });

  if (capabilities.length === 0) {
    notes.push("No pipeline tag, tag or name pattern identified a capability, so this is reported as general rather than guessed at.");
  }

  if (meta.gated) {
    notes.push(typeof meta.gated === "string" ? `Access is gated (${meta.gated}); a Hugging Face token with access is required to download it.` : "Access is gated; a Hugging Face token with access is required to download it.");
  }
  if (meta.disabled) {
    notes.push("This repository is disabled on Hugging Face and cannot be downloaded.");
  }

  return {
    primary: capabilities[0]?.id ?? "general",
    capabilities,
    parameterScale: readParameterScale(meta.id),
    quantization: readQuantization(meta),
    contextLength: readContextLength(meta),
    notes,
  };
}

/** Human labels, kept in one place so the store and the server agree. */
export const CAPABILITY_LABELS: Record<CapabilityId | "general", string> = {
  chat: "Conversation",
  coding: "Coding",
  reasoning: "Reasoning",
  summarization: "Summarisation",
  translation: "Translation",
  "data-analysis": "Data analysis",
  math: "Mathematics",
  vision: "Vision",
  "speech-to-text": "Speech to text",
  "text-to-speech": "Text to speech",
  "image-generation": "Image generation",
  embeddings: "Embeddings & search",
  classification: "Classification",
  "long-context": "Long context",
  "tool-use": "Tool use",
  general: "General purpose",
};

/** A one-line description of what a capability is good for, used in the store UI. */
export const CAPABILITY_DESCRIPTIONS: Record<CapabilityId | "general", string> = {
  chat: "Everyday conversation and instruction following.",
  coding: "Writing, explaining and repairing code.",
  reasoning: "Multi-step problems that need working through.",
  summarization: "Condensing long documents into their point.",
  translation: "Moving text between languages.",
  "data-analysis": "Querying, shaping and interpreting tabular data.",
  math: "Arithmetic, algebra and formal problems.",
  vision: "Reading images, screenshots and diagrams.",
  "speech-to-text": "Transcribing audio into text.",
  "text-to-speech": "Turning text into spoken audio.",
  "image-generation": "Producing images from a description.",
  embeddings: "Similarity, clustering and retrieval.",
  classification: "Labelling text or tokens into categories.",
  "long-context": "Very long inputs in a single pass.",
  "tool-use": "Calling functions and driving agents.",
  general: "No specific capability was identified from its metadata.",
};
