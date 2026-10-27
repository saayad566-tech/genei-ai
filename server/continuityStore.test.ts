import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
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

describe("without a database", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("refuses to save, and says what to set", async () => {
    // A save that silently does nothing is worse than an error: the user closes the app
    // believing their work is stored.
    await expect(saveContinuityProject(1, "Episode 1", project())).rejects.toThrow(PersistenceUnavailableError);
    await expect(saveContinuityProject(1, "Episode 1", project())).rejects.toThrow(/DATABASE_URL/);
  });

  it("refuses to list, load or delete", async () => {
    await expect(listContinuityProjects(1)).rejects.toThrow(PersistenceUnavailableError);
    await expect(loadContinuityProject(1, 1)).rejects.toThrow(PersistenceUnavailableError);
    await expect(deleteContinuityProject(1, 1)).rejects.toThrow(PersistenceUnavailableError);
  });

  it("states plainly that nothing was stored", async () => {
    await expect(saveContinuityProject(1, "x", project())).rejects.toThrow(/Nothing was stored/i);
  });
});

describe("validation that runs before any database call", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("rejects a blank name with the real problem, not a database error", async () => {
    // Validation runs before infrastructure, so the message names the actual fault.
    await expect(saveContinuityProject(1, "   ", project())).rejects.toThrow(ProjectDocumentError);
    await expect(saveContinuityProject(1, "   ", project())).rejects.toThrow(/needs a name/i);
  });

  it("rejects an over-long name before touching the database", async () => {
    await expect(saveContinuityProject(1, "x".repeat(256), project())).rejects.toThrow(/255 characters/i);
  });
});
