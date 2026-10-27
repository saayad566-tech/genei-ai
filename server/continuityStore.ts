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
  const db = await requireDb();
  const rows = await db
    .select({ id: continuityProjects.id })
    .from(continuityProjects)
    .where(and(eq(continuityProjects.userId, userId), eq(continuityProjects.id, id)));

  if (rows.length === 0) return false;

  await db.delete(continuityProjects).where(eq(continuityProjects.id, id));
  return true;
}
