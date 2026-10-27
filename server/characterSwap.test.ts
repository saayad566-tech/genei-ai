import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildSwapPayload,
  buildSwapPrompt,
  SWAP_REQUIREMENTS,
  SWAP_SYSTEM_PROMPT,
  SwapInputError,
  validateSwapInputs,
} from "./characterSwap";

/**
 * Character swap / video-to-video.
 *
 * These test the prompt construction and input validation. The prompt is the product here:
 * a model that is told to preserve motion but is not told what "preserve" excludes will
 * change the camera path, and the user will get something that looks wrong without knowing
 * why.
 */

let sandbox: string;
let video: string;
let face: string;

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-swap-"));
  video = path.join(sandbox, "reference.mp4");
  face = path.join(sandbox, "character.jpg");
  await fs.writeFile(video, Buffer.alloc(2048, 1));
  await fs.writeFile(face, Buffer.alloc(1024, 2));
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * The system prompt
 * ------------------------------------------------------------------ */

describe("system prompt", () => {
  it("names the two things being combined", () => {
    expect(SWAP_SYSTEM_PROMPT).toMatch(/reference video/i);
    expect(SWAP_SYSTEM_PROMPT).toMatch(/character reference/i);
  });

  it("requires motion and camera consistency, not just visual style", () => {
    expect(SWAP_SYSTEM_PROMPT).toMatch(/frame-by-frame motion/i);
    expect(SWAP_SYSTEM_PROMPT).toMatch(/camera movement/i);
  });

  it("forbids substituting a different person or altering the camera path", () => {
    expect(SWAP_SYSTEM_PROMPT).toMatch(/never substitute a different person/i);
    expect(SWAP_SYSTEM_PROMPT).toMatch(/never alter the camera path/i);
  });

  it("is a system instruction, not a user preference", () => {
    // The constraints only hold if the model treats them as role-level.
    expect(SWAP_SYSTEM_PROMPT).toMatch(/^You are/i);
  });
});

/* ------------------------------------------------------------------ *
 * The user prompt
 * ------------------------------------------------------------------ */

describe("user prompt", () => {
  it("names both files so the model can resolve them", () => {
    const prompt = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face });
    expect(prompt.user).toContain("reference.mp4");
    expect(prompt.user).toContain("character.jpg");
  });

  it("does not inline file data", () => {
    const prompt = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face });
    expect(prompt.user.length).toBeLessThan(2000);
    expect(prompt.user).not.toContain("base64");
  });

  it("includes wardrobe when given, and omits the clause when not", () => {
    const withWardrobe = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face, wardrobe: "a red kurta" });
    expect(withWardrobe.user).toContain("a red kurta");

    const without = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face });
    expect(without.user).not.toMatch(/Wardrobe:/);
  });

  it("includes identity notes when given", () => {
    const prompt = buildSwapPrompt({
      referenceVideoPath: video,
      characterReferencePath: face,
      identityNotes: ["short dark hair", "thin-framed glasses"],
    });
    expect(prompt.user).toContain("short dark hair");
    expect(prompt.user).toContain("thin-framed glasses");
  });

  it("drops blank identity notes rather than emitting empty clauses", () => {
    const prompt = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face, identityNotes: ["", "  "] });
    expect(prompt.user).not.toMatch(/Identity must remain identical to:\s*\./);
  });

  it("tells the model not to alter camera path, background or timing", () => {
    const prompt = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face });
    expect(prompt.user).toMatch(/do not alter the camera path/i);
    expect(prompt.user).toMatch(/background/i);
    expect(prompt.user).toMatch(/timing/i);
  });

  it("enumerates what to preserve and what to replace", () => {
    const prompt = buildSwapPrompt({ referenceVideoPath: video, characterReferencePath: face });
    expect(prompt.preserve).toContain("frame-by-frame motion");
    expect(prompt.preserve).toContain("pacing and timing");
    expect(prompt.replace.some((r) => /identity/i.test(r))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("input validation", () => {
  it("accepts a real video and a real image", async () => {
    const sizes = await validateSwapInputs({ referenceVideoPath: video, characterReferencePath: face });
    expect(sizes.referenceBytes).toBe(2048);
    expect(sizes.characterBytes).toBe(1024);
  });

  it("rejects a missing reference video, naming it", async () => {
    await expect(
      validateSwapInputs({ referenceVideoPath: path.join(sandbox, "nope.mp4"), characterReferencePath: face }),
    ).rejects.toThrow(/reference video/i);
  });

  it("rejects an empty file rather than submitting a doomed job", async () => {
    const empty = path.join(sandbox, "empty.mp4");
    await fs.writeFile(empty, "");
    await expect(
      validateSwapInputs({ referenceVideoPath: empty, characterReferencePath: face }),
    ).rejects.toThrow(/empty \(0 bytes\)/i);
  });

  it("rejects a character reference that cannot carry a face", async () => {
    const bad = path.join(sandbox, "notes.txt");
    await fs.writeFile(bad, "not a face");
    await expect(
      validateSwapInputs({ referenceVideoPath: video, characterReferencePath: bad }),
    ).rejects.toThrow(SwapInputError);
  });

  it("accepts a short video as the character reference", async () => {
    const clip = path.join(sandbox, "face.mp4");
    await fs.writeFile(clip, Buffer.alloc(512, 3));
    await expect(validateSwapInputs({ referenceVideoPath: video, characterReferencePath: clip })).resolves.toBeTruthy();
  });

  it("rejects a blank path", async () => {
    await expect(validateSwapInputs({ referenceVideoPath: "  ", characterReferencePath: face })).rejects.toThrow(
      SwapInputError,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

describe("execution payload", () => {
  it("carries both references and both prompts", () => {
    const payload = buildSwapPayload({ referenceVideoPath: video, characterReferencePath: face });
    expect(payload.referenceVideo).toBe(video);
    expect(payload.characterReference).toBe(face);
    expect(payload.systemPrompt).toBe(SWAP_SYSTEM_PROMPT);
    expect(typeof payload.prompt).toBe("string");
  });

  it("is self-describing when inspected later", () => {
    const payload = buildSwapPayload({ referenceVideoPath: video, characterReferencePath: face });
    expect(payload.mode).toBe("replicate");
    expect(Array.isArray(payload.preserve)).toBe(true);
    expect(Array.isArray(payload.replace)).toBe(true);
  });

  it("states null wardrobe rather than omitting the key", () => {
    // A workflow node reading payload.wardrobe should not have to distinguish missing from empty.
    const payload = buildSwapPayload({ referenceVideoPath: video, characterReferencePath: face });
    expect(payload.wardrobe).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Requirements reporting
 * ------------------------------------------------------------------ */

describe("requirements", () => {
  it("names a concrete way to run the mode, not just 'unsupported'", () => {
    const joined = SWAP_REQUIREMENTS.join(" ");
    expect(joined).toMatch(/video-to-video|face-swap/i);
    expect(joined).toMatch(/ComfyUI|workflow/i);
  });

  it("mentions that the character reference is required", () => {
    expect(SWAP_REQUIREMENTS.join(" ")).toMatch(/character reference/i);
  });
});
