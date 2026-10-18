import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Documentation truthfulness.
 *
 * Documents drift. A claim that was true when it was written can become false as the
 * product changes, and a stale "we cannot do X" is worse than no document at all — it
 * tells the reader to stop trying. This file pins the claims that have already gone
 * stale once, so they cannot quietly come back.
 *
 * It is deliberately narrow: it checks specific, checkable statements, not prose style.
 */

const docsDir = path.resolve(process.cwd(), "docs");
const docs = fs
  .readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({ name, text: fs.readFileSync(path.join(docsDir, name), "utf8") }));

const read = (name: string) => docs.find((doc) => doc.name === name)?.text ?? "";

describe("documentation does not repeat claims that have been disproven", () => {
  it("has documents to check", () => {
    expect(docs.length).toBeGreaterThan(5);
  });

  it("does not claim a Windows executable cannot be built on Linux", () => {
    // electron-builder bundles its own wine; a Windows target does build on Linux, and a
    // real PE32+ binary was produced and verified. Stating otherwise tells the reader to
    // stop trying.
    for (const doc of docs) {
      expect(doc.text, `${doc.name} claims a Windows PE cannot be produced on Linux`).not.toMatch(
        /Linux sandbox cannot generate a genuine Windows PE|cannot generate a genuine Windows PE executable/i,
      );
    }
  });

  it("names the delivered Windows artifact", () => {
    const status = read("AI_DIRECTOR_200_POINT_IMPLEMENTATION_STATUS.md");
    expect(status).toMatch(/PE32\+/);
    expect(status).toMatch(/Genei-AI-Desktop-Windows-Portable\.zip/);
  });

  it("does not claim the pairing workflow does not exist", () => {
    // The desktop app ships a Render runners panel that issues a one-time pairing token.
    const byoh = read("BYOK_BYOH_EXPORT_GUIDE.md");
    expect(byoh).toMatch(/Render runners/);
    expect(byoh, "still claims there is no pairing token").not.toMatch(/no (separate runner executable, )?one-time pairing token/i);
  });

  it("states plainly that the desktop build has not been run on Windows", () => {
    // The build is genuine; claiming it is a verified Windows experience is not.
    const pwa = read("PWA_FIRST_RELEASE.md");
    expect(pwa).toMatch(/not been run on a Windows machine/i);
  });

  it("classifies every capability with one of the four required categories", () => {
    // The specification requires IMPLEMENTED / PARTIALLY_IMPLEMENTED / BLOCKED /
    // NOT_IMPLEMENTED, and forbids calling a point IMPLEMENTED merely because an
    // interface exists.
    const status = read("AI_DIRECTOR_200_POINT_IMPLEMENTATION_STATUS.md");
    for (const category of ["IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "BLOCKED", "NOT_IMPLEMENTED"]) {
      expect(status, `${category} section is missing`).toContain(category);
    }
  });

  it("keeps a real execution path named for the implemented capabilities", () => {
    const status = read("AI_DIRECTOR_200_POINT_IMPLEMENTATION_STATUS.md");
    // Each IMPLEMENTED row must point at a file or test, not just a claim.
    const fileRefs = status.match(/`[a-z_./]+\.(ts|py|tsx)`/g) ?? [];
    expect(fileRefs.length, "no file references in the IMPLEMENTED table").toBeGreaterThan(10);
  });
});
