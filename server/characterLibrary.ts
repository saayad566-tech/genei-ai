/**
 * A persistent character library.
 *
 * The video-to-avatar feature derives an avatar from an uploaded video, but a user who has
 * already established a character should not have to re-derive it every time. This stores
 * characters so they can be picked by name and reused across videos.
 *
 * Stored as a single JSON file inside the app's data directory: no database required, works
 * offline, and the file is the user's to inspect or delete.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export type CharacterRecord = {
  id: string;
  name: string;
  /** Plain-language description of the person. */
  appearance: string;
  wardrobe: string[];
  /** Details that must stay identical across every scene, or continuity breaks. */
  distinguishing: string[];
  /** Optional reference face image, relative to the media directory. */
  referenceImage?: string;
  /** Where this character came from. */
  origin: "derived-from-video" | "uploaded-face" | "manual";
  createdAt: string;
  updatedAt: string;
};

export type CharacterInput = {
  name: string;
  appearance: string;
  wardrobe?: string[];
  distinguishing?: string[];
  referenceImage?: string;
  origin?: CharacterRecord["origin"];
};

function dataDir(): string {
  return process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
}

function libraryPath(): string {
  return path.join(dataDir(), "characters.json");
}

export class CharacterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterValidationError";
  }
}

/** Names are the handle a user picks a character by, so they must be unique and non-empty. */
export function validateCharacter(input: CharacterInput): CharacterInput {
  const name = (input.name ?? "").trim();
  if (name.length < 1) throw new CharacterValidationError("A character needs a name.");
  if (name.length > 60) throw new CharacterValidationError("A character name must be 60 characters or fewer.");

  const appearance = (input.appearance ?? "").trim();
  if (appearance.length < 3) {
    throw new CharacterValidationError(
      "Describe the character's appearance in at least a few words. A name alone cannot keep a face consistent.",
    );
  }

  return {
    name,
    appearance,
    wardrobe: (input.wardrobe ?? []).map((v) => v.trim()).filter(Boolean),
    distinguishing: (input.distinguishing ?? []).map((v) => v.trim()).filter(Boolean),
    referenceImage: input.referenceImage?.trim() || undefined,
    origin: input.origin ?? "manual",
  };
}

/** The consistency fragment the generator uses, built from the stored fields. */
export function consistencyPromptFor(record: Pick<CharacterRecord, "appearance" | "wardrobe" | "distinguishing">): string {
  const distinguishing = record.distinguishing.length > 0 ? record.distinguishing : ["appearance as described"];
  const wardrobe = record.wardrobe.length > 0 ? record.wardrobe : ["consistent clothing"];
  return `${record.appearance} Always identical: ${distinguishing.join("; ")}. Wardrobe: ${wardrobe.join("; ")}.`;
}

async function readAll(): Promise<CharacterRecord[]> {
  try {
    const raw = await fs.readFile(libraryPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Tolerate a hand-edited file: drop anything that is not a usable record rather than
    // throwing and making the whole library unreachable.
    return parsed.filter(
      (entry): entry is CharacterRecord =>
        typeof entry === "object" && entry !== null && typeof (entry as CharacterRecord).id === "string",
    );
  } catch {
    // No file yet is the normal first-run case, not an error.
    return [];
  }
}

async function writeAll(records: CharacterRecord[]): Promise<void> {
  const target = libraryPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Write to a temp file and rename, so an interrupted write cannot corrupt the library.
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temp, target);
}

export async function listCharacters(): Promise<CharacterRecord[]> {
  const all = await readAll();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCharacter(id: string): Promise<CharacterRecord | undefined> {
  return (await readAll()).find((entry) => entry.id === id);
}

export async function saveCharacter(input: CharacterInput): Promise<CharacterRecord> {
  const valid = validateCharacter(input);
  const all = await readAll();

  const existingIndex = all.findIndex((entry) => entry.name.toLowerCase() === valid.name.toLowerCase());
  const now = new Date().toISOString();

  if (existingIndex !== -1) {
    // Same name means update: a user re-saving "Akshya" expects to refine it, not to end up
    // with two characters they cannot tell apart.
    const updated: CharacterRecord = {
      ...all[existingIndex],
      ...valid,
      id: all[existingIndex].id,
      origin: valid.origin ?? all[existingIndex].origin,
      createdAt: all[existingIndex].createdAt,
      updatedAt: now,
    };
    all[existingIndex] = updated;
    await writeAll(all);
    return updated;
  }

  const record: CharacterRecord = {
    id: `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: valid.name,
    appearance: valid.appearance,
    wardrobe: valid.wardrobe ?? [],
    distinguishing: valid.distinguishing ?? [],
    referenceImage: valid.referenceImage,
    origin: valid.origin ?? "manual",
    createdAt: now,
    updatedAt: now,
  };
  all.push(record);
  await writeAll(all);
  return record;
}

export async function deleteCharacter(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((entry) => entry.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}

/** A stable, named character derived from a video analysis, ready to save. */
export function characterFromDerived(input: {
  appearance: string;
  wardrobe: string[];
  distinguishing: string[];
  name?: string;
}): CharacterInput {
  return {
    name: input.name?.trim() || `Character ${new Date().toISOString().slice(0, 10)}`,
    appearance: input.appearance,
    wardrobe: input.wardrobe,
    distinguishing: input.distinguishing,
    origin: "derived-from-video",
  };
}
