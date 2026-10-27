import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildSpeechEngines, engineReport, pickEngine, synthesiseToFile, type VoiceRecord } from "./voiceStudio";

/**
 * Piper, end to end.
 *
 * This runs the real binary and asserts the output is a real WAV with real audio in it. It
 * skips — with a stated reason, never a pass — when Piper is not configured, because a
 * synthesis test that silently passes without synthesising anything is worse than no test.
 */

const PIPER_BIN = process.env.GENEI_PIPER_BIN ?? "/scratch/work/piper/piper/piper";
const PIPER_VOICE = process.env.GENEI_PIPER_VOICE ?? "/scratch/work/piper/piper/voices/en_US-lessac-low.onnx";
const available = existsSync(PIPER_BIN) && existsSync(PIPER_VOICE);

let sandbox: string;

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-piper-test-"));
  if (available) {
    process.env.GENEI_PIPER_BIN = PIPER_BIN;
    process.env.GENEI_PIPER_VOICE = PIPER_VOICE;
  }
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

const voice: VoiceRecord = {
  id: "v1",
  name: "Narrator",
  description: "warm",
  kind: "designed",
  language: "en",
  createdAt: "",
  updatedAt: "",
};

describe("Piper engine registration", () => {
  it("reports unavailable with an actionable requirement when not configured", () => {
    const saved = { bin: process.env.GENEI_PIPER_BIN, v: process.env.GENEI_PIPER_VOICE };
    delete process.env.GENEI_PIPER_BIN;
    delete process.env.GENEI_PIPER_VOICE;
    const engines = buildSpeechEngines(null);
    const piper = engines.find((e) => e.id === "piper");
    expect(piper?.available).toBe(false);
    expect(piper?.requirement).toMatch(/GENEI_PIPER_BIN/);
    if (saved.bin !== undefined) process.env.GENEI_PIPER_BIN = saved.bin;
    if (saved.v !== undefined) process.env.GENEI_PIPER_VOICE = saved.v;
  });

  it("prefers local Piper over a remote server, because it needs no network", () => {
    const engines = buildSpeechEngines({ baseUrl: "http://remote/v1", model: "tts-1" });
    const piper = engines.find((e) => e.id === "piper");
    if (piper?.available) {
      expect(pickEngine(engines).id).toBe("piper");
    } else {
      // Without Piper configured the remote engine is correctly chosen instead.
      expect(pickEngine(engines).id).toBe("openai-compatible");
    }
  });
});

describe.skipIf(!available)("Piper synthesis, for real", () => {
  it("produces a real WAV with real audio in it", { timeout: 120_000 }, async () => {
    const out = path.join(sandbox, "line.wav");
    const result = await synthesiseToFile({ text: "This is a real synthesized voice.", voice, format: "wav" }, out, buildSpeechEngines(null));

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.bytes).toBeGreaterThan(1000);
      expect(result.engine).toMatch(/Piper/i);
    }

    const buffer = await fs.readFile(out);
    // RIFF/WAVE header — proves it is audio, not an error page written to disk.
    expect(buffer.subarray(0, 4).toString()).toBe("RIFF");
    expect(buffer.subarray(8, 12).toString()).toBe("WAVE");

    // And the payload is not silence: a WAV of pure zeros would satisfy a length check.
    const payload = buffer.subarray(44);
    const nonZero = payload.some((byte) => byte !== 0);
    expect(nonZero).toBe(true);
  });

  it("speaks a longer line into proportionally more audio", { timeout: 120_000 }, async () => {
    const short = path.join(sandbox, "short.wav");
    const long = path.join(sandbox, "long.wav");
    await synthesiseToFile({ text: "One two.", voice }, short, buildSpeechEngines(null));
    await synthesiseToFile(
      { text: "One two three four five six seven eight nine ten eleven twelve.", voice },
      long,
      buildSpeechEngines(null),
    );
    const shortSize = (await fs.stat(short)).size;
    const longSize = (await fs.stat(long)).size;
    expect(longSize).toBeGreaterThan(shortSize);
  });

  it("refuses empty text rather than producing silence", { timeout: 60_000 }, async () => {
    const out = path.join(sandbox, "empty.wav");
    const result = await synthesiseToFile({ text: "   ", voice }, out, buildSpeechEngines(null));
    expect(result.status).toBe("unavailable");
    expect(existsSync(out)).toBe(false);
  });

  it("reports the engine in the result, so a user knows what spoke", { timeout: 120_000 }, async () => {
    const out = path.join(sandbox, "named.wav");
    const result = await synthesiseToFile({ text: "Named engine.", voice }, out, buildSpeechEngines(null));
    if (result.status === "ok") expect(result.engine).toContain("Piper");
  });
});
