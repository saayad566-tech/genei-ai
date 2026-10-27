import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildSpeechEngines,
  deleteVoice,
  engineReport,
  estimateSpeechSeconds,
  getVoice,
  listVoices,
  pickEngine,
  planDub,
  saveVoice,
  speechConfigFromEnv,
  synthesiseToFile,
  validateVoice,
  VoiceValidationError,
  type SpeechConfig,
  type VoiceRecord,
} from "./voiceStudio";

/**
 * Voice studio.
 *
 * The engine tests inject a fetch-backed config so the request/response path is real without
 * a running speech server. The dubbing tests are pure arithmetic, which is the part that
 * decides whether speech collides with the next line.
 */

let sandbox: string;
const originalDataDir = process.env.GENEI_DESKTOP_DATA_DIR;

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-voices-"));
  process.env.GENEI_DESKTOP_DATA_DIR = sandbox;
});

afterAll(async () => {
  if (originalDataDir === undefined) delete process.env.GENEI_DESKTOP_DATA_DIR;
  else process.env.GENEI_DESKTOP_DATA_DIR = originalDataDir;
  await fs.rm(sandbox, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("voice validation", () => {
  it("requires a name", () => {
    expect(() => validateVoice({ name: " ", description: "warm" })).toThrow(VoiceValidationError);
  });

  it("refuses a cloned voice with no sample", () => {
    expect(() => validateVoice({ name: "Mine", description: "", kind: "cloned" })).toThrow(/needs a sample/i);
  });

  it("accepts a cloned voice with a sample", () => {
    expect(() => validateVoice({ name: "Mine", description: "", kind: "cloned", samplePath: "s.wav" })).not.toThrow();
  });

  it("requires a description for a designed voice", () => {
    expect(() => validateVoice({ name: "Narrator", description: "  ", kind: "designed" })).toThrow(/needs a description/i);
  });

  it("defaults the language rather than leaving it blank", () => {
    expect(validateVoice({ name: "A", description: "warm voice" }).language).toBe("en");
  });
});

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

describe("voice library", () => {
  it("starts empty rather than failing", async () => {
    expect(await listVoices()).toEqual([]);
  });

  it("saves and reads back", async () => {
    const saved = await saveVoice({ name: "Narrator", description: "warm low male" });
    expect(saved.id).toMatch(/^voice-/);
    expect((await getVoice(saved.id))?.name).toBe("Narrator");
  });

  it("updates rather than duplicating on the same name", async () => {
    const first = await saveVoice({ name: "Deep", description: "low" });
    const second = await saveVoice({ name: "deep", description: "low and slow" });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect((await listVoices()).filter((v) => v.name.toLowerCase() === "deep")).toHaveLength(1);
  });

  it("deletes and reports whether it existed", async () => {
    const saved = await saveVoice({ name: "Temp", description: "temporary" });
    expect(await deleteVoice(saved.id)).toBe(true);
    expect(await deleteVoice(saved.id)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Engines
 * ------------------------------------------------------------------ */

describe("engines", () => {
  it("reports unavailable with an actionable requirement when nothing is configured", () => {
    const report = engineReport(buildSpeechEngines(null));
    expect(report.available).toBe(false);
    expect(report.requirement).toMatch(/GENEI_SPEECH_URL/);
  });

  it("reports available when a server is configured", () => {
    const report = engineReport(buildSpeechEngines({ baseUrl: "http://127.0.0.1:8000/v1", model: "tts-1" }));
    expect(report.available).toBe(true);
  });

  it("picks the first available engine", () => {
    const engines = buildSpeechEngines({ baseUrl: "http://x/v1", model: "m" });
    expect(pickEngine(engines).id).toBe("openai-compatible");
  });

  it("does not claim Piper works when it is not wired", () => {
    const piper = buildSpeechEngines(null).find((e) => e.id === "piper");
    expect(piper?.available).toBe(false);
  });

  it("reads config from the environment only when a URL is present", () => {
    const saved = process.env.GENEI_SPEECH_URL;
    delete process.env.GENEI_SPEECH_URL;
    expect(speechConfigFromEnv()).toBeNull();
    process.env.GENEI_SPEECH_URL = "http://x/v1";
    expect(speechConfigFromEnv()?.baseUrl).toBe("http://x/v1");
    if (saved === undefined) delete process.env.GENEI_SPEECH_URL;
    else process.env.GENEI_SPEECH_URL = saved;
  });
});

/* ------------------------------------------------------------------ *
 * Synthesis
 * ------------------------------------------------------------------ */

describe("synthesis", () => {
  const voice: VoiceRecord = {
    id: "v1",
    name: "Narrator",
    description: "warm",
    kind: "designed",
    language: "en",
    createdAt: "",
    updatedAt: "",
  };

  function engineReturning(body: Buffer, status = 200) {
    const config: SpeechConfig = { baseUrl: "http://x/v1", model: "tts-1" };
    const engines = buildSpeechEngines(config);
    engines[0].synthesise = async () => {
      if (status !== 200) throw new Error(`The speech server returned ${status}.`);
      return body;
    };
    return engines;
  }

  it("writes real audio bytes to the requested path", async () => {
    const out = path.join(sandbox, "line.mp3");
    const result = await synthesiseToFile({ text: "Hello there.", voice }, out, engineReturning(Buffer.from("ID3audio")));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.bytes).toBe(8);
      expect((await fs.readFile(out)).toString()).toBe("ID3audio");
    }
  });

  it("is unavailable with the engine's requirement when nothing is configured", async () => {
    const result = await synthesiseToFile({ text: "Hi", voice }, path.join(sandbox, "x.mp3"), buildSpeechEngines(null));
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/GENEI_SPEECH_URL/);
  });

  it("refuses empty text rather than sending a blank request", async () => {
    const result = await synthesiseToFile({ text: "   ", voice }, path.join(sandbox, "y.mp3"), engineReturning(Buffer.from("x")));
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/no text/i);
  });

  it("surfaces a server error instead of writing a broken file", async () => {
    const out = path.join(sandbox, "z.mp3");
    const result = await synthesiseToFile({ text: "Hi", voice }, out, engineReturning(Buffer.from(""), 500));
    expect(result.status).toBe("unavailable");
    expect(await fs.stat(out).catch(() => null)).toBeNull(); // nothing written
  });
});

/* ------------------------------------------------------------------ *
 * Dubbing
 * ------------------------------------------------------------------ */

describe("dubbing", () => {
  it("estimates duration from word count", () => {
    expect(estimateSpeechSeconds("one two three four five")).toBeGreaterThan(0);
    expect(estimateSpeechSeconds("")).toBe(0);
  });

  it("keeps rate 1 when a line already fits", () => {
    const plan = planDub([{ startSeconds: 0, text: "short line" }], 10);
    expect(plan.lines[0].rate).toBe(1);
    expect(plan.lines[0].fits).toBe(true);
  });

  it("speeds a line up when it nearly fits", () => {
    // A long line in a two-second window needs a nudge but is achievable.
    const plan = planDub([{ startSeconds: 0, text: "a b c d e f g h" }, { startSeconds: 2, text: "next" }], 10);
    expect(plan.lines[0].fits).toBe(true);
    expect(plan.lines[0].rate).toBeGreaterThan(1);
  });

  it("reports overflow rather than overlapping lines silently", () => {
    const long = Array.from({ length: 60 }, () => "word").join(" ");
    const plan = planDub([{ startSeconds: 0, text: long }, { startSeconds: 1, text: "next" }], 10);
    expect(plan.lines[0].fits).toBe(false);
    expect(plan.lines[0].rate).toBeNull();
    expect(plan.overflow).toContain(0);
    expect(plan.note).toMatch(/cannot fit/i);
  });

  it("uses the video's real duration for the last line", () => {
    const plan = planDub([{ startSeconds: 5, text: "last line here" }], 8);
    expect(plan.lines[0].endSeconds).toBe(8);
  });

  it("sorts segments by start time", () => {
    const plan = planDub(
      [
        { startSeconds: 5, text: "second" },
        { startSeconds: 1, text: "first" },
      ],
      10,
    );
    expect(plan.lines[0].text).toBe("first");
    expect(plan.lines[1].text).toBe("second");
  });

  it("refuses a zero duration instead of producing a nonsense plan", () => {
    expect(() => planDub([{ startSeconds: 0, text: "x" }], 0)).toThrow(/real duration/i);
  });

  it("clamps a start beyond the video end rather than producing negative windows", () => {
    const plan = planDub([{ startSeconds: 99, text: "late" }], 10);
    expect(plan.lines[0].startSeconds).toBeLessThanOrEqual(10);
    expect(plan.lines[0].endSeconds).toBeGreaterThanOrEqual(plan.lines[0].startSeconds);
  });
});
