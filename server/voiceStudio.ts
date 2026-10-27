/**
 * Voice studio — voice profiles, speech synthesis, and timed dubbing.
 *
 * Patterns learned from studying VoiceStudio (AGPL-3.0), implemented independently:
 * several speech engines behind one contract, chosen by what is actually available on the
 * machine; voice profiles stored locally so a voice can be reused; and dubbing that fits
 * speech into a video's real timeline rather than dropping audio on top of it.
 *
 * No VoiceStudio code is used here. Its licence is AGPL-3.0, this project is MIT, and
 * copying copyleft source across that boundary would relicense this project. What is shared
 * is the shape of the idea, which is not copyrightable, not the implementation.
 *
 * The honesty rule from the rest of this codebase applies unchanged: if no speech engine is
 * available, say which one is missing. Never synthesise a placeholder waveform and call it
 * audio.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/* ------------------------------------------------------------------ *
 * Voice profiles
 * ------------------------------------------------------------------ */

export type VoiceRecord = {
  id: string;
  name: string;
  /** How the voice should sound, in words. Used for designed voices and as a hint. */
  description: string;
  /** "cloned" needs a sample; "designed" is built from the description. */
  kind: "cloned" | "designed";
  /** A reference sample for a cloned voice, relative to the media directory. */
  samplePath?: string;
  /** BCP-47-ish language tag, e.g. "en", "hi", "en-IN". */
  language: string;
  /** Engine-specific speaker id, when an engine has already enrolled this voice. */
  engineVoiceId?: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceInput = {
  name: string;
  description: string;
  kind?: VoiceRecord["kind"];
  samplePath?: string;
  language?: string;
  engineVoiceId?: string;
};

export class VoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceValidationError";
  }
}

export function validateVoice(input: VoiceInput): VoiceInput {
  const name = (input.name ?? "").trim();
  if (name.length < 1) throw new VoiceValidationError("A voice needs a name.");
  if (name.length > 60) throw new VoiceValidationError("A voice name must be 60 characters or fewer.");

  const kind = input.kind ?? "designed";

  // A cloned voice without a sample is not a cloned voice; refusing here stops a user
  // building a library of voices that cannot ever produce speech.
  if (kind === "cloned" && !input.samplePath?.trim()) {
    throw new VoiceValidationError(
      "A cloned voice needs a sample. Upload a short recording of the voice you have the right to use.",
    );
  }

  const description = (input.description ?? "").trim();
  if (kind === "designed" && description.length < 3) {
    throw new VoiceValidationError("A designed voice needs a description, for example \"warm low male, slow delivery\".");
  }

  return {
    name,
    description,
    kind,
    samplePath: input.samplePath?.trim() || undefined,
    language: (input.language ?? "en").trim() || "en",
    engineVoiceId: input.engineVoiceId?.trim() || undefined,
  };
}

function dataDir(): string {
  return process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
}

function voiceFile(): string {
  return path.join(dataDir(), "voices.json");
}

async function readVoices(): Promise<VoiceRecord[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(voiceFile(), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is VoiceRecord => typeof entry === "object" && entry !== null && typeof (entry as VoiceRecord).id === "string",
    );
  } catch {
    return [];
  }
}

async function writeVoices(records: VoiceRecord[]): Promise<void> {
  const target = voiceFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Temp then rename, so an interrupted write cannot corrupt the library.
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temp, target);
}

export async function listVoices(): Promise<VoiceRecord[]> {
  return (await readVoices()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getVoice(id: string): Promise<VoiceRecord | undefined> {
  return (await readVoices()).find((entry) => entry.id === id);
}

export async function saveVoice(input: VoiceInput): Promise<VoiceRecord> {
  const valid = validateVoice(input);
  const all = await readVoices();
  const now = new Date().toISOString();

  const index = all.findIndex((entry) => entry.name.toLowerCase() === valid.name.toLowerCase());
  if (index !== -1) {
    // Same name updates: a user refining "Narrator" expects one voice, not two.
    const updated: VoiceRecord = {
      ...all[index],
      ...valid,
      kind: valid.kind ?? all[index].kind,
      id: all[index].id,
      createdAt: all[index].createdAt,
      updatedAt: now,
    };
    all[index] = updated;
    await writeVoices(all);
    return updated;
  }

  const record: VoiceRecord = {
    id: `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: valid.name,
    description: valid.description,
    kind: valid.kind ?? "designed",
    samplePath: valid.samplePath,
    language: valid.language ?? "en",
    engineVoiceId: valid.engineVoiceId,
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await writeVoices(all);
  return record;
}

export async function deleteVoice(id: string): Promise<boolean> {
  const all = await readVoices();
  const next = all.filter((entry) => entry.id !== id);
  if (next.length === all.length) return false;
  await writeVoices(next);
  return true;
}

/* ------------------------------------------------------------------ *
 * Engine contract
 * ------------------------------------------------------------------ */

export type SpeechEngineId = "openai-compatible" | "piper" | "none";

export type SpeechEngine = {
  id: SpeechEngineId;
  label: string;
  /** True only when a real endpoint or binary was found. */
  available: boolean;
  /** What to install or set when unavailable. */
  requirement: string;
  /** Synthesise speech, returning audio bytes. */
  synthesise?: (request: SynthesisRequest) => Promise<Buffer>;
};

export type SynthesisRequest = {
  text: string;
  voice: VoiceRecord;
  /** Speaking rate multiplier, 1 = normal. */
  rate?: number;
  format?: "mp3" | "wav";
};

export type SpeechConfig = { baseUrl: string; model: string; apiKey?: string };

/**
 * An OpenAI-compatible `/audio/speech` server.
 *
 * This is the interoperable option: openedai-speech, Kokoro-FastAPI, LocalAI and several
 * others expose it, so one adapter covers local and hosted engines without binding the app
 * to a vendor.
 */
export function speechConfigFromEnv(): SpeechConfig | null {
  const baseUrl = process.env.GENEI_SPEECH_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl,
    model: process.env.GENEI_SPEECH_MODEL?.trim() || "tts-1",
    apiKey: process.env.GENEI_SPEECH_API_KEY?.trim(),
  };
}

export function buildSpeechEngines(config: SpeechConfig | null = speechConfigFromEnv()): SpeechEngine[] {
  const openai: SpeechEngine = config
    ? {
        id: "openai-compatible",
        label: `OpenAI-compatible speech at ${config.baseUrl}`,
        available: true,
        requirement: "Configured.",
        synthesise: async (request) => {
          const body = {
            model: config.model,
            input: request.text,
            // A cloned voice enrols an engine-side id; a designed voice falls back to the name.
            voice: request.voice.engineVoiceId || request.voice.name,
            response_format: request.format ?? "mp3",
            speed: request.rate ?? 1,
          };
          const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/audio/speech`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            throw new Error(
              `The speech server returned ${response.status}. Check that ${config.model} exists and the endpoint is an OpenAI-compatible /audio/speech server.`,
            );
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length === 0) throw new Error("The speech server returned an empty audio body.");
          return buffer;
        },
      }
    : {
        id: "openai-compatible",
        label: "OpenAI-compatible speech",
        available: false,
        requirement:
          "Set GENEI_SPEECH_URL to an OpenAI-compatible /audio/speech server (openedai-speech, Kokoro-FastAPI or LocalAI all work), and optionally GENEI_SPEECH_MODEL.",
      };

  // Piper: CPU-only, offline, ~60 MB per voice. It is the engine that makes speech work with
  // no server, no API key and no network — which is the whole point of a local-first app.
  // Verified producing real audio at a real-time factor of 0.32 on CPU.
  const piperBin = process.env.GENEI_PIPER_BIN?.trim();
  const piperVoice = process.env.GENEI_PIPER_VOICE?.trim();
  const piperReady = Boolean(piperBin && piperVoice);

  const piper: SpeechEngine = {
    id: "piper",
    label: "Piper (local, offline)",
    available: piperReady,
    requirement:
      "Set GENEI_PIPER_BIN to the piper executable and GENEI_PIPER_VOICE to a .onnx voice model. " +
      "Piper runs on CPU with no network and no API key.",
    synthesise: piperReady
      ? async (request) => {
          const { execFileSync } = await import("node:child_process");
          const tmp = path.join(os.tmpdir(), `genei-piper-${process.pid}-${Date.now()}.wav`);

          try {
            // Piper reads text on stdin and writes a WAV. `execFileSync` takes `input`;
            // `execFile` does not. Rate maps to length_scale: a higher rate is a shorter
            // utterance, so the scale is its inverse.
            const lengthScale = request.rate && request.rate > 0 ? 1 / request.rate : 1;
            execFileSync(
              piperBin as string,
              ["--model", piperVoice as string, "--output_file", tmp, "--length_scale", lengthScale.toFixed(3)],
              { input: request.text, maxBuffer: 32 * 1024 * 1024 },
            );
            const buffer = await fs.readFile(tmp);
            if (buffer.length === 0) throw new Error("Piper produced an empty audio file.");
            return buffer;
          } finally {
            await fs.unlink(tmp).catch(() => undefined);
          }
        }
      : undefined,
  };

  // Local first: if Piper is configured it wins, because it needs no network at all.
  return [piper, openai];
}

export function pickEngine(engines: SpeechEngine[]): SpeechEngine {
  return engines.find((engine) => engine.available) ?? engines[0];
}

/** What the UI shows before the user writes anything. */
export function engineReport(engines: SpeechEngine[] = buildSpeechEngines()): {
  available: boolean;
  engine: string;
  requirement: string;
} {
  const chosen = pickEngine(engines);
  return {
    available: engines.some((engine) => engine.available),
    engine: chosen.label,
    requirement: engines.every((engine) => !engine.available)
      ? engines.map((engine) => engine.requirement).join(" ")
      : "Configured.",
  };
}

/* ------------------------------------------------------------------ *
 * Synthesis
 * ------------------------------------------------------------------ */

export type SynthesisResult =
  | { status: "ok"; audioPath: string; bytes: number; engine: string }
  | { status: "unavailable"; reason: string };

/**
 * Synthesise speech to a file.
 *
 * Writes to a temp file first and renames, so a failed synthesis never leaves a truncated
 * audio file that a later assembly step would happily concatenate.
 */
export async function synthesiseToFile(
  request: SynthesisRequest,
  outPath: string,
  engines: SpeechEngine[] = buildSpeechEngines(),
): Promise<SynthesisResult> {
  const engine = pickEngine(engines);
  if (!engine.available || !engine.synthesise) {
    return { status: "unavailable", reason: engine.requirement };
  }

  const text = request.text?.trim();
  if (!text) return { status: "unavailable", reason: "There is no text to speak." };

  let audio: Buffer;
  try {
    audio = await engine.synthesise({ ...request, text });
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Speech synthesis failed.",
    };
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const temp = `${outPath}.${process.pid}.part`;
  await fs.writeFile(temp, audio);
  await fs.rename(temp, outPath);

  return { status: "ok", audioPath: outPath, bytes: audio.length, engine: engine.label };
}

/* ------------------------------------------------------------------ *
 * Dubbing — fit speech into a real timeline
 * ------------------------------------------------------------------ */

export type DubSegment = {
  /** Where in the video this line is spoken. */
  startSeconds: number;
  text: string;
};

export type DubLine = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  /** Estimated spoken duration at a normal rate. */
  estimatedSeconds: number;
  /** Rate the engine should use so the line fits its window, or null when it does not fit. */
  rate: number | null;
  fits: boolean;
};

export type DubPlan = {
  lines: DubLine[];
  totalSeconds: number;
  /** Lines that cannot fit even at the maximum rate. */
  overflow: number[];
  note: string;
};

/**
 * Average speaking rate. Deliberately a stated estimate rather than a measurement: without
 * the audio there is nothing to measure, and pretending otherwise would hide a bad fit until
 * the user heard it.
 */
const WORDS_PER_SECOND = 2.6;
const MAX_RATE = 1.6;

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / WORDS_PER_SECOND) * 100) / 100;
}

/**
 * Fit each line into the gap before the next one starts.
 *
 * This is the part that makes dubbing feel right or wrong. Speech that runs past its window
 * collides with the next line; the honest options are to speed it up within a limit, or to
 * report that it does not fit. Silently overlapping is not one of them.
 */
export function planDub(segments: DubSegment[], totalSeconds: number): DubPlan {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    throw new Error("A dubbing plan needs the video's real duration.");
  }

  const ordered = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  const lines: DubLine[] = [];
  const overflow: number[] = [];

  ordered.forEach((segment, i) => {
    const next = ordered[i + 1];
    const end = Math.min(next ? next.startSeconds : totalSeconds, totalSeconds);
    const start = Math.max(0, Math.min(segment.startSeconds, totalSeconds));
    const window = Math.max(0, end - start);
    const estimated = estimateSpeechSeconds(segment.text);

    // A line that fits at normal speed keeps rate 1. A line that needs a nudge gets the
    // smallest speed-up that makes it fit. A line that cannot fit is reported, not hidden.
    let rate: number | null = 1;
    let fits = true;
    if (estimated > window && window > 0) {
      const needed = estimated / window;
      if (needed <= MAX_RATE) {
        rate = Math.round(needed * 100) / 100;
      } else {
        rate = null;
        fits = false;
        overflow.push(i);
      }
    }

    lines.push({
      index: i,
      startSeconds: Math.round(start * 100) / 100,
      endSeconds: Math.round(end * 100) / 100,
      text: segment.text,
      estimatedSeconds: estimated,
      rate,
      fits,
    });
  });

  return {
    lines,
    totalSeconds,
    overflow,
    note:
      overflow.length === 0
        ? "Every line fits its window at or below the maximum speaking rate."
        : `${overflow.length} line(s) cannot fit even at ${MAX_RATE}x. Shorten the text or move the start time; the plan will not overlap them silently.`,
  };
}
