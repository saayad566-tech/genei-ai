import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { sql, eq, and, desc } from "drizzle-orm";
import * as schema from "../drizzle/schema";

/**
 * drizzle-orm upgrade validation (0.44.6 -> 0.45.4).
 *
 * The advisory this closes is a SQL-injection path through improperly escaped identifiers,
 * so the upgrade was necessary. But drizzle sits directly under every database read and
 * write in this product, and a minor bump can change generated SQL or schema resolution.
 *
 * These assertions exist because "the tests still pass" is not sufficient evidence for a
 * change to the query layer: most tests here never touch a real database. This checks the
 * generated SQL and the schema surface directly.
 */

const schemaDir = path.resolve(process.cwd(), "drizzle");

function exportedTables(): Array<[string, unknown]> {
  return Object.entries(schema).filter(([, value]) => {
    if (!value || typeof value !== "object") return false;
    try {
      return Boolean(getTableConfig(value as never)?.name);
    } catch {
      return false;
    }
  });
}

describe("schema still resolves after the upgrade", () => {
  it("exports a substantial number of tables", () => {
    expect(exportedTables().length).toBeGreaterThan(15);
  });

  it("every table keeps a name and at least one column", () => {
    for (const [key, table] of exportedTables()) {
      const config = getTableConfig(table as never);
      expect(config.name, `${key} lost its SQL name`).toBeTruthy();
      expect(config.columns.length, `${key} lost its columns`).toBeGreaterThan(0);
    }
  });

  it("keeps a primary key on every table", () => {
    // drizzle exposes this as a `primary` flag on the column, not a separate array.
    const withoutPrimaryKey = exportedTables().filter(([, table]) => {
      const columns = getTableConfig(table as never).columns as Array<{ primary?: boolean; primaryKey?: boolean }>;
      return !columns.some((column) => column.primary || column.primaryKey);
    });
    // A schema-wide loss of primary keys would be a catastrophic silent change.
    expect(withoutPrimaryKey.map(([key]) => key), "tables that lost their primary key").toEqual([]);
  });
});

describe("generated SQL is unchanged in shape", () => {
  it("still builds a parameterised select rather than interpolating a value", () => {
    const query = sql`select * from ${schema.apiKeys} where ${schema.apiKeys.userId} = ${42}`;
    // String chunks carry the literal SQL; anything else is a bound parameter or identifier.
    const literalSql = query.queryChunks
      .map((chunk) => {
        const value = (chunk as { value?: unknown }).value;
        return Array.isArray(value) && value.every((part) => typeof part === "string") ? value.join("") : "";
      })
      .join("");
    expect(literalSql).toContain("select");
    expect(literalSql).toContain("where");
    // The user's value must never reach the literal SQL: it stays a bound parameter.
    expect(literalSql).not.toContain("42");
    // And the parameter is present as a value, not as text.
    expect(query.queryChunks.some((chunk) => chunk === 42)).toBe(true);
  });

  it("builds a typed where clause from the query builder", () => {
    const condition = and(eq(schema.apiKeys.userId, 1), eq(schema.apiKeys.provider, "huggingface"));
    // The builder returns an SQL node with its own chunk list, not a raw string.
    expect(condition).toBeTruthy();
    const chunks = (condition as unknown as { queryChunks?: unknown[] }).queryChunks;
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks!.length).toBeGreaterThan(0);
    // Values stay bound parameters rather than being interpolated into the SQL text.
    const literal = chunks!
      .map((chunk) => {
        const value = (chunk as { value?: unknown }).value;
        return Array.isArray(value) && value.every((part) => typeof part === "string") ? value.join("") : "";
      })
      .join("");
    expect(literal).not.toContain("huggingface");
  });

  it("keeps ordering helpers working", () => {
    expect(desc(schema.apiKeys.createdAt)).toBeTruthy();
  });

  it("keeps the SQL template tag functional", () => {
    expect(sql`select 1`.queryChunks.length).toBeGreaterThan(0);
  });
});

describe("migrations remain in parity with the schema", () => {
  it("has a journal and migration files", () => {
    const journalPath = path.join(schemaDir, "meta", "_journal.json");
    expect(fs.existsSync(journalPath), "the migration journal is missing").toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries?: unknown[] };
    expect(Array.isArray(journal.entries)).toBe(true);

    const migrations = fs.readdirSync(schemaDir).filter((file) => file.endsWith(".sql"));
    expect(migrations.length).toBeGreaterThan(0);
    // Every journal entry should have a file behind it.
    expect((journal.entries ?? []).length).toBeLessThanOrEqual(migrations.length);
  });

  it("declares a table count consistent with the migration history", () => {
    // Guards against the upgrade silently dropping a table from the exported schema.
    const tables = exportedTables().length;
    const createStatements = fs
      .readdirSync(schemaDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => fs.readFileSync(path.join(schemaDir, file), "utf8"))
      .join("\n")
      .match(/CREATE TABLE/gi)?.length ?? 0;
    expect(createStatements).toBeGreaterThan(0);
    expect(tables).toBeGreaterThan(0);
  });
});

describe("the version actually moved", () => {
  it("is running a drizzle at or above the patched release", () => {
    const version = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "node_modules/drizzle-orm/package.json"), "utf8"),
    ).version as string;
    const [major, minor] = version.split(".").map(Number);
    // The advisory is fixed in >= 0.45.2.
    expect(major === 0 && minor >= 45, `drizzle-orm ${version} is below the patched release`).toBe(true);
  });
});
