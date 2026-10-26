import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  characterFromDerived,
  CharacterValidationError,
  consistencyPromptFor,
  deleteCharacter,
  getCharacter,
  listCharacters,
  saveCharacter,
  validateCharacter,
} from "./characterLibrary";
import {
  characterFromAvatar,
  characterFromRecord,
  clampSimilarity,
  planSimilarVideo,
  buildAvatarProfile,
  type SubjectDescription,
} from "./videoToAvatar";

/**
 * Character library and similar-video planning.
 *
 * The library writes to the real data directory, so these tests point it at a temp dir via
 * GENEI_DESKTOP_DATA_DIR and clean up after themselves — otherwise they would read and
 * modify whatever the developer has stored.
 */

let sandbox: string;
const originalDataDir = process.env.GENEI_DESKTOP_DATA_DIR;

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-chars-"));
  process.env.GENEI_DESKTOP_DATA_DIR = sandbox;
});

afterAll(async () => {
  if (originalDataDir === undefined) delete process.env.GENEI_DESKTOP_DATA_DIR;
  else process.env.GENEI_DESKTOP_DATA_DIR = originalDataDir;
  await fs.rm(sandbox, { recursive: true, force: true });
});

const ANALYSIS: SubjectDescription = {
  description: "A person walking outdoors.",
  distinguishing: ["short dark hair"],
  wardrobe: ["dark jacket"],
  setting: ["a paved path"],
  visualStyle: ["natural daylight"],
  motion: ["walking"],
  mood: "calm",
  shotCount: 6,
  pacing: "measured",
};

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("character validation", () => {
  it("requires a name", () => {
    expect(() => validateCharacter({ name: "  ", appearance: "a person" })).toThrow(CharacterValidationError);
  });

  it("requires more than a name — an appearance description", () => {
    expect(() => validateCharacter({ name: "Akshya", appearance: "  " })).toThrow(/cannot keep a face consistent/i);
  });

  it("rejects an over-long name", () => {
    expect(() => validateCharacter({ name: "x".repeat(61), appearance: "a person" })).toThrow(/60 characters/i);
  });

  it("trims and drops empty list entries", () => {
    const out = validateCharacter({ name: " A ", appearance: " a person ", wardrobe: [" coat ", ""], distinguishing: ["", " glasses "] });
    expect(out.name).toBe("A");
    expect(out.wardrobe).toEqual(["coat"]);
    expect(out.distinguishing).toEqual(["glasses"]);
  });
});

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

describe("character library", () => {
  it("starts empty rather than failing when no file exists", async () => {
    expect(await listCharacters()).toEqual([]);
  });

  it("saves and reads back a character", async () => {
    const saved = await saveCharacter({ name: "Akshya", appearance: "A person with short dark hair", wardrobe: ["dark jacket"] });
    expect(saved.id).toMatch(/^char-/);
    expect(saved.origin).toBe("manual");

    const fetched = await getCharacter(saved.id);
    expect(fetched?.name).toBe("Akshya");
  });

  it("updates rather than duplicating when the same name is saved again", async () => {
    const first = await saveCharacter({ name: "Ravi", appearance: "A tall person" });
    const second = await saveCharacter({ name: "ravi", appearance: "A tall person with a beard" });

    expect(second.id).toBe(first.id); // same record, refined
    expect(second.appearance).toContain("beard");
    expect(second.createdAt).toBe(first.createdAt); // creation time preserved

    const all = await listCharacters();
    expect(all.filter((c) => c.name.toLowerCase() === "ravi")).toHaveLength(1);
  });

  it("deletes a character and reports whether it existed", async () => {
    const saved = await saveCharacter({ name: "Temp", appearance: "A temporary character" });
    expect(await deleteCharacter(saved.id)).toBe(true);
    expect(await getCharacter(saved.id)).toBeUndefined();
    expect(await deleteCharacter(saved.id)).toBe(false);
  });

  it("keeps the library readable after a hand-edited file with junk entries", async () => {
    await saveCharacter({ name: "Keeper", appearance: "A valid character" });
    const file = path.join(sandbox, "characters.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    // Simulate a user editing the file by hand and breaking one entry.
    raw.push(null, "not an object", { name: "no id" });
    await fs.writeFile(file, JSON.stringify(raw), "utf8");

    const all = await listCharacters();
    expect(all.some((c) => c.name === "Keeper")).toBe(true);
    // Every surviving entry is usable.
    for (const entry of all) expect(typeof entry.id).toBe("string");
  });

  it("builds a derived character with the derived origin", () => {
    const input = characterFromDerived({ appearance: "A person", wardrobe: ["coat"], distinguishing: ["glasses"] });
    expect(input.origin).toBe("derived-from-video");
    expect(input.name).toBeTruthy();
  });

  it("builds a consistency prompt that names the distinguishing detail", () => {
    const prompt = consistencyPromptFor({ appearance: "A person", wardrobe: ["coat"], distinguishing: ["glasses"] });
    expect(prompt).toContain("glasses");
    expect(prompt).toMatch(/Always identical/i);
  });
});

/* ------------------------------------------------------------------ *
 * Similarity
 * ------------------------------------------------------------------ */

describe("similarity", () => {
  it("clamps out-of-range and non-finite values", () => {
    expect(clampSimilarity(-1)).toBe(0);
    expect(clampSimilarity(2)).toBe(1);
    expect(clampSimilarity(Number.NaN)).toBe(0.5);
    expect(clampSimilarity(undefined)).toBe(0.5);
    expect(clampSimilarity(0.25)).toBe(0.25);
  });
});

/* ------------------------------------------------------------------ *
 * Similar-video planning
 * ------------------------------------------------------------------ */

describe("planSimilarVideo", () => {
  const character = characterFromAvatar(buildAvatarProfile(ANALYSIS, "m", 8));

  it("follows the source's shot count more closely at high similarity", () => {
    const loose = planSimilarVideo(character, ANALYSIS, 0);
    const tight = planSimilarVideo(character, ANALYSIS, 1);
    // The source claims 6 shots; at similarity 1 the plan should be closer to 6 than at 0.
    expect(Math.abs(tight.scenes.length - ANALYSIS.shotCount)).toBeLessThanOrEqual(
      Math.abs(loose.scenes.length - ANALYSIS.shotCount),
    );
  });

  it("never produces an unusable plan for an absurd source shot count", () => {
    const absurd: SubjectDescription = { ...ANALYSIS, shotCount: 500 };
    const plan = planSimilarVideo(character, absurd, 1);
    expect(plan.scenes.length).toBeLessThanOrEqual(12);
    expect(plan.scenes.length).toBeGreaterThanOrEqual(3);
  });

  it("always produces at least three scenes", () => {
    for (const level of [0, 0.3, 0.5, 0.8, 1]) {
      expect(planSimilarVideo(character, { ...ANALYSIS, shotCount: 1 }, level).scenes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("carries the CHOSEN character into every scene prompt", () => {
    const libraryChar = characterFromRecord(
      { id: "char-1", name: "Meera", appearance: "A person with long hair", wardrobe: ["green sari"], distinguishing: ["a bindi"] },
      consistencyPromptFor({ appearance: "A person with long hair", wardrobe: ["green sari"], distinguishing: ["a bindi"] }),
    );
    const plan = planSimilarVideo(libraryChar, ANALYSIS, 0.7);
    for (const scene of plan.scenes) {
      expect(scene.prompt).toContain("long hair");
      expect(scene.prompt).toContain("green sari");
      // And NOT the person from the source video.
      expect(scene.prompt).not.toContain("short dark hair");
    }
  });

  it("keeps the negative-prompt quality guards in every scene", () => {
    const plan = planSimilarVideo(character, ANALYSIS, 0.5);
    for (const scene of plan.scenes) {
      expect(scene.prompt).toMatch(/no distortion/i);
      expect(scene.prompt).toMatch(/no warping/i);
    }
  });

  it("matches the source's pacing in scene length", () => {
    const slow = planSimilarVideo(character, { ...ANALYSIS, pacing: "slow" }, 1);
    const fast = planSimilarVideo(character, { ...ANALYSIS, pacing: "fast" }, 1);
    expect(slow.scenes[0].durationSeconds).toBeGreaterThan(fast.scenes[0].durationSeconds);
  });

  it("states that the output is a new work, not a copy", () => {
    const plan = planSimilarVideo(character, ANALYSIS, 1);
    expect(plan.originalityNote).toMatch(/new work/i);
    expect(plan.originalityNote).toMatch(/not a copy/i);
  });

  it("reports the similarity level it actually used", () => {
    expect(planSimilarVideo(character, ANALYSIS, 0.8).title).toContain("80%");
  });

  it("numbers scenes from 1 without gaps and totals a real duration", () => {
    const plan = planSimilarVideo(character, ANALYSIS, 0.6);
    expect(plan.scenes.map((s) => s.index)).toEqual(plan.scenes.map((_, i) => i + 1));
    expect(plan.totalDurationSeconds).toBe(plan.scenes.reduce((sum, s) => sum + s.durationSeconds, 0));
    expect(plan.totalDurationSeconds).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Character sources
 * ------------------------------------------------------------------ */

describe("character sources", () => {
  it("marks an uploaded-face character distinctly from a library one", () => {
    const base = { id: "c1", name: "X", appearance: "a person", wardrobe: [], distinguishing: [] };
    expect(characterFromRecord({ ...base, referenceImage: "faces/x.jpg" }, "p").source).toBe("uploaded-face");
    expect(characterFromRecord(base, "p").source).toBe("library");
  });

  it("derives a character from an avatar with its consistency prompt intact", () => {
    const avatar = buildAvatarProfile(ANALYSIS, "m", 8);
    const character = characterFromAvatar(avatar);
    expect(character.source).toBe("derived");
    expect(character.consistencyPrompt).toBe(avatar.consistencyPrompt);
  });
});
