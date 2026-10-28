/**
 * Persistence for continuity projects.
 *
 * The continuity engine takes a whole project at once and is pure. This is the layer that
 * keeps one between sessions.
 *
 * The governing rule, consistent with the rest of this codebase: **without a database this
 * refuses rather than pretends.** A save that silently does nothing is worse than an error,
 * because the user closes the app believing their work is stored. Every function here
 * returns a real result or throws with the exact thing to set.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { and, desc, eq } from "drizzle-orm";
import { continuityProjects } from "../drizzle/schema";
import { getDb } from "./db";
import { checkContinuity, type ContinuityProject } from "@shared/continuity";

/** Bumped when the stored document shape changes, so old rows can be migrated, not mis-read. */
export const SCHEMA_VERSION = 1;

export class PersistenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceUnavailableError";
  }
}

export class ProjectDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectDocumentError";
  }
}

export type StoredProject = {
  id: number;
  name: string;
  document: ContinuityProject;
  schemaVersion: number;
  lastErrorCount: number;
  lastWarningCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function dataDir(): string {
  return process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
}

/* ------------------------------------------------------------------ *
 * File-backed backend
 * ------------------------------------------------------------------ */

/**
 * Without a database, projects are stored as JSON files in the app's data directory.
 *
 * This is the same pattern `characterLibrary` and `voiceStudio` already use, and it is the
 * right one here rather than a second SQL schema: the app is local-first, a project document
 * is a single JSON value, and a user who has no MySQL should still be able to save their work.
 *
 * Writes go to a temp file and rename, so an interrupted write cannot corrupt the store.
 */
function projectsFile(userId: number): string {
  return path.join(dataDir(), `continuity-projects-${userId}.json`);
}

type FileRow = {
  id: number;
  name: string;
  document: string;
  schemaVersion: number;
  lastErrorCount: number;
  lastWarningCount: number;
  createdAt: string;
  updatedAt: string;
};

async function readFileRows(userId: number): Promise<FileRow[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(projectsFile(userId), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Tolerate a hand-edited file: drop unusable rows rather than making the store unreachable.
    return parsed.filter(
      (row): row is FileRow =>
        typeof row === "object" && row !== null && typeof (row as FileRow).id === "number" && typeof (row as FileRow).document === "string",
    );
  } catch {
    return [];
  }
}

async function writeFileRows(userId: number, rows: FileRow[]): Promise<void> {
  const target = projectsFile(userId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(rows, null, 2), "utf8");
  await fs.rename(temp, target);
}

/** True when the file backend should be used instead of MySQL. */
export function usingFileBackend(): boolean {
  return !process.env.DATABASE_URL;
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new PersistenceUnavailableError(
      "No database is configured, so continuity projects cannot be saved. Set DATABASE_URL to a MySQL instance and run the migrations. Nothing was stored.",
    );
  }
  return db;
}

function validateName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 1) throw new ProjectDocumentError("A project needs a name.");
  if (trimmed.length > 255) throw new ProjectDocumentError("A project name must be 255 characters or fewer.");
  return trimmed;
}

/**
 * Parse a stored document, migrating or refusing rather than guessing.
 *
 * A document from a newer schema is refused outright: silently reading a shape we do not
 * understand would let a continuity check run against a film it has mis-parsed, and a wrong
 * "clean" report is the worst possible outcome.
 */
export function parseStoredDocument(raw: string, schemaVersion: number): ContinuityProject {
  if (schemaVersion > SCHEMA_VERSION) {
    throw new ProjectDocumentError(
      `This project was saved by a newer version (schema ${schemaVersion}, this build understands ${SCHEMA_VERSION}). Upgrade rather than risk mis-reading it.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProjectDocumentError("The stored project is not valid JSON, so it cannot be read.");
  }

  const doc = parsed as Partial<ContinuityProject>;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.scenes)) {
    throw new ProjectDocumentError("The stored project has no scene list, so there is nothing to check.");
  }

  // Fill the collections so a hand-written or older document cannot crash the engine.
  return {
    characters: Array.isArray(doc.characters) ? doc.characters : [],
    locations: Array.isArray(doc.locations) ? doc.locations : [],
    props: Array.isArray(doc.props) ? doc.props : [],
    scenes: doc.scenes,
  };
}

export async function saveContinuityProject(
  userId: number,
  name: string,
  project: ContinuityProject,
): Promise<StoredProject> {
  const cleanName = validateName(name);

  if (usingFileBackend()) {
    const report = checkContinuity(project);
    const rows = await readFileRows(userId);
    const now = new Date().toISOString();
    const existing = rows.find((row) => row.name.toLowerCase() === cleanName.toLowerCase());

    // Same name updates, matching the database path and the character library.
    if (existing) {
      existing.document = JSON.stringify(project);
      existing.schemaVersion = SCHEMA_VERSION;
      existing.lastErrorCount = report.counts.error;
      existing.lastWarningCount = report.counts.warning;
      existing.updatedAt = now;
      await writeFileRows(userId, rows);
      return {
        id: existing.id,
        name: existing.name,
        document: project,
        schemaVersion: SCHEMA_VERSION,
        lastErrorCount: report.counts.error,
        lastWarningCount: report.counts.warning,
        createdAt: new Date(existing.createdAt),
        updatedAt: new Date(now),
      };
    }

    const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    rows.push({
      id,
      name: cleanName,
      document: JSON.stringify(project),
      schemaVersion: SCHEMA_VERSION,
      lastErrorCount: report.counts.error,
      lastWarningCount: report.counts.warning,
      createdAt: now,
      updatedAt: now,
    });
    await writeFileRows(userId, rows);
    return {
      id,
      name: cleanName,
      document: project,
      schemaVersion: SCHEMA_VERSION,
      lastErrorCount: report.counts.error,
      lastWarningCount: report.counts.warning,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  const db = await requireDb();

  // Counts are cached at save time so a list view does not re-run the engine for every row.
  const report = checkContinuity(project);
  const document = JSON.stringify(project);

  const existing = await db
    .select()
    .from(continuityProjects)
    .where(and(eq(continuityProjects.userId, userId), eq(continuityProjects.name, cleanName)));

  // Same name updates: a user re-saving "Episode 1" expects to refine it, not to accumulate
  // versions they cannot tell apart.
  if (existing.length > 0) {
    const target = existing[0];
    await db
      .update(continuityProjects)
      .set({
        document,
        schemaVersion: SCHEMA_VERSION,
        lastErrorCount: report.counts.error,
        lastWarningCount: report.counts.warning,
      })
      .where(eq(continuityProjects.id, target.id));

    return {
      id: target.id,
      name: cleanName,
      document: project,
      schemaVersion: SCHEMA_VERSION,
      lastErrorCount: report.counts.error,
      lastWarningCount: report.counts.warning,
      createdAt: target.createdAt,
      updatedAt: new Date(),
    };
  }

  const inserted = await db.insert(continuityProjects).values({
    userId,
    name: cleanName,
    document,
    schemaVersion: SCHEMA_VERSION,
    lastErrorCount: report.counts.error,
    lastWarningCount: report.counts.warning,
  });

  const id = Number((inserted as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0);

  return {
    id,
    name: cleanName,
    document: project,
    schemaVersion: SCHEMA_VERSION,
    lastErrorCount: report.counts.error,
    lastWarningCount: report.counts.warning,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function listContinuityProjects(
  userId: number,
): Promise<Array<Omit<StoredProject, "document"> & { sceneCount: number }>> {
  if (usingFileBackend()) {
    const rows = await readFileRows(userId);
    return rows
      .map((row) => {
        let sceneCount = 0;
        try {
          sceneCount = parseStoredDocument(row.document, row.schemaVersion).scenes.length;
        } catch {
          sceneCount = 0; // still listed, so it can be seen and deleted
        }
        return {
          id: row.id,
          name: row.name,
          schemaVersion: row.schemaVersion,
          lastErrorCount: row.lastErrorCount,
          lastWarningCount: row.lastWarningCount,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          sceneCount,
        };
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  const db = await requireDb();
  const rows = await db
    .select()
    .from(continuityProjects)
    .where(eq(continuityProjects.userId, userId))
    .orderBy(desc(continuityProjects.updatedAt));

  return rows.map((row) => {
    let sceneCount = 0;
    try {
      const doc = parseStoredDocument(row.document, row.schemaVersion);
      sceneCount = doc.scenes.length;
    } catch {
      // A row that will not parse is still listed, with sceneCount 0, so the user can see
      // and delete it rather than having it silently vanish from the list.
      sceneCount = 0;
    }
    return {
      id: row.id,
      name: row.name,
      schemaVersion: row.schemaVersion,
      lastErrorCount: row.lastErrorCount,
      lastWarningCount: row.lastWarningCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sceneCount,
    };
  });
}

export async function loadContinuityProject(userId: number, id: number): Promise<StoredProject> {
  if (usingFileBackend()) {
    const rows = await readFileRows(userId);
    const row = rows.find((entry) => entry.id === id);
    if (!row) throw new ProjectDocumentError("That project does not exist, or belongs to someone else.");
    return {
      id: row.id,
      name: row.name,
      document: parseStoredDocument(row.document, row.schemaVersion),
      schemaVersion: row.schemaVersion,
      lastErrorCount: row.lastErrorCount,
      lastWarningCount: row.lastWarningCount,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  const db = await requireDb();
  const rows = await db
    .select()
    .from(continuityProjects)
    .where(and(eq(continuityProjects.userId, userId), eq(continuityProjects.id, id)));

  if (rows.length === 0) throw new ProjectDocumentError("That project does not exist, or belongs to someone else.");
  const row = rows[0];

  return {
    id: row.id,
    name: row.name,
    document: parseStoredDocument(row.document, row.schemaVersion),
    schemaVersion: row.schemaVersion,
    lastErrorCount: row.lastErrorCount,
    lastWarningCount: row.lastWarningCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteContinuityProject(userId: number, id: number): Promise<boolean> {
  if (usingFileBackend()) {
    const rows = await readFileRows(userId);
    const next = rows.filter((row) => row.id !== id);
    if (next.length === rows.length) return false;
    await writeFileRows(userId, next);
    return true;
  }

  const db = await requireDb();
  const rows = await db
    .select({ id: continuityProjects.id })
    .from(continuityProjects)
    .where(and(eq(continuityProjects.userId, userId), eq(continuityProjects.id, id)));

  if (rows.length === 0) return false;

  await db.delete(continuityProjects).where(eq(continuityProjects.id, id));
  return true;
}
