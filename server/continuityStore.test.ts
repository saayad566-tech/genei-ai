import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  usingFileBackend,
  deleteContinuityProject,
  listContinuityProjects,
  loadContinuityProject,
  parseStoredDocument,
  PersistenceUnavailableError,
  ProjectDocumentError,
  saveContinuityProject,
  SCHEMA_VERSION,
} from "./continuityStore";
import type { ContinuityProject } from "@shared/continuity";

/**
 * Continuity persistence.
 *
 * The database-backed paths need a live MySQL, which this environment does not have. What IS
 * testable is the part that decides whether the layer is honest: document parsing, version
 * refusal, and the degradation path when no database exists. Those are tested here.
 */

const project = (): ContinuityProject => ({
  characters: [{ id: "aria", name: "Aria", wardrobe: ["coat"] }],
  locations: [{ id: "outpost", name: "Outpost" }],
  props: [],
  scenes: [
    {
      id: "s1",
      index: 1,
      time: { label: "day 1", order: 1 },
      locationId: "outpost",
      characters: [{ characterId: "aria", wardrobe: ["coat"] }],
      props: [],
    },
  ],
});

describe("parseStoredDocument", () => {
  it("reads a valid document", () => {
    const doc = parseStoredDocument(JSON.stringify(project()), SCHEMA_VERSION);
    expect(doc.scenes).toHaveLength(1);
    expect(doc.characters[0].id).toBe("aria");
  });

  it("refuses a document from a NEWER schema rather than guessing", () => {
    // Mis-reading a shape we do not understand would let a check run against a film it
    // parsed wrongly, and a wrong "clean" report is the worst outcome.
    expect(() => parseStoredDocument(JSON.stringify(project()), SCHEMA_VERSION + 1)).toThrow(/newer version/i);
  });

  it("refuses invalid JSON with a clear message", () => {
    expect(() => parseStoredDocument("{not json", SCHEMA_VERSION)).toThrow(ProjectDocumentError);
  });

  it("refuses a document with no scene list", () => {
    expect(() => parseStoredDocument(JSON.stringify({ characters: [] }), SCHEMA_VERSION)).toThrow(/no scene list/i);
  });

  it("fills missing collections so the engine cannot crash on an older document", () => {
    const doc = parseStoredDocument(JSON.stringify({ scenes: [] }), SCHEMA_VERSION);
    expect(doc.characters).toEqual([]);
    expect(doc.locations).toEqual([]);
    expect(doc.props).toEqual([]);
  });
});

describe("without a database: the file backend", () => {
  let saved: string | undefined;
  let dataDir: string;

  beforeEach(async () => {
    saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "genei-cstore-"));
    process.env.GENEI_DESKTOP_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    delete process.env.GENEI_DESKTOP_DATA_DIR;
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("reports that the file backend is in use", () => {
    expect(usingFileBackend()).toBe(true);
  });

  it("saves and loads a project for real", async () => {
    // A user with no MySQL should still be able to save their work. Refusing here would
    // make the continuity feature unusable on the machine it is designed for.
    const stored = await saveContinuityProject(7, "Episode 1", project());
    expect(stored.id).toBeGreaterThan(0);

    const loaded = await loadContinuityProject(7, stored.id);
    expect(loaded.name).toBe("Episode 1");
    expect(loaded.document.scenes).toHaveLength(1);
  });

  it("lists what was saved, with the scene count and cached counts", async () => {
    await saveContinuityProject(7, "Episode 1", project());
    const list = await listContinuityProjects(7);
    expect(list).toHaveLength(1);
    expect(list[0].sceneCount).toBe(1);
  });

  it("updates on the same name rather than duplicating", async () => {
    const first = await saveContinuityProject(7, "Episode 1", project());
    const second = await saveContinuityProject(7, "episode 1", project());
    expect(second.id).toBe(first.id);
    expect(await listContinuityProjects(7)).toHaveLength(1);
  });

  it("deletes, and reports whether it existed", async () => {
    const stored = await saveContinuityProject(7, "Gone", project());
    expect(await deleteContinuityProject(7, stored.id)).toBe(true);
    expect(await deleteContinuityProject(7, stored.id)).toBe(false);
  });

  it("keeps one user's projects out of another's", async () => {
    await saveContinuityProject(7, "Mine", project());
    expect(await listContinuityProjects(8)).toEqual([]);
  });

  it("caches the error count at save time", async () => {
    const broken: ContinuityProject = {
      ...project(),
      scenes: [
        {
          id: "s1",
          index: 1,
          time: { label: "d1", order: 1 },
          locationId: "outpost",
          characters: [{ characterId: "ghost", wardrobe: [] }],
          props: [],
        },
      ],
    };
    const stored = await saveContinuityProject(7, "Broken", broken);
    expect(stored.lastErrorCount).toBeGreaterThan(0);
  });

  it("survives a hand-edited file with junk rows", async () => {
    await saveContinuityProject(7, "Keeper", project());
    const file = path.join(dataDir, "continuity-projects-7.json");
    const rows = JSON.parse(await fs.readFile(file, "utf8"));
    rows.push(null, "junk", { id: "not-a-number" });
    await fs.writeFile(file, JSON.stringify(rows), "utf8");

    const list = await listContinuityProjects(7);
    expect(list.some((entry) => entry.name === "Keeper")).toBe(true);
  });

  it("refuses to load someone else's project", async () => {
    const stored = await saveContinuityProject(7, "Mine", project());
    await expect(loadContinuityProject(8, stored.id)).rejects.toThrow(ProjectDocumentError);
  });
});

describe("validation runs before storage is touched", () => {
  let saved: string | undefined;
  let dataDir: string;

  beforeEach(async () => {
    saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "genei-cval-"));
    process.env.GENEI_DESKTOP_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    delete process.env.GENEI_DESKTOP_DATA_DIR;
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("rejects a blank name with the real problem, not a storage error", async () => {
    // Validation runs before infrastructure, so the message names the actual fault.
    await expect(saveContinuityProject(1, "   ", project())).rejects.toThrow(ProjectDocumentError);
    await expect(saveContinuityProject(1, "   ", project())).rejects.toThrow(/needs a name/i);
  });

  it("rejects an over-long name before touching the database", async () => {
    await expect(saveContinuityProject(1, "x".repeat(256), project())).rejects.toThrow(/255 characters/i);
  });
});
