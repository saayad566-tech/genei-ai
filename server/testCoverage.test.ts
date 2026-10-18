import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Test-collection guard.
 *
 * A test file that exists but is never collected is worse than no test at all: it reads
 * as coverage. This happened twice here — a client `.ts` unit test never matched the
 * include pattern, and seven jsdom files failed to load because a transitive dependency
 * (`undici@8` via `jsdom@30`) crashes on Node 20, so they errored out before a single
 * assertion ran.
 *
 * This checks the configuration and the dependency graph, not the test bodies.
 */

const root = path.resolve(process.cwd());
const config = fs.readFileSync(path.join(root, "vitest.config.ts"), "utf8");

function testFilesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "release", "build", "artifacts", ".git"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) out.push(path.relative(root, full));
    }
  };
  for (const dir of ["server", "client", "shared"]) walk(path.join(root, dir));
  return out;
}

describe("every test file is actually collected", () => {
  it("matches both .ts and .tsx under client, server and shared", () => {
    for (const pattern of [
      "server/**/*.test.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
      "shared/**/*.test.ts",
    ]) {
      expect(config, `vitest.config.ts does not include ${pattern}`).toContain(pattern);
    }
  });

  it("finds a substantial number of test files", () => {
    // If this drops sharply, files have been moved out of the walked tree or renamed.
    expect(testFilesOnDisk().length).toBeGreaterThan(30);
  });

  it("includes every .ts and .tsx test file the include patterns claim to cover", () => {
    const patterns = [...config.matchAll(/"((?:server|client|shared)\/\*\*\/\*\.(?:test|spec)\.(?:ts|tsx))"/g)].map((m) => m[1]);
    const covered = (file: string) =>
      patterns.some((pattern) => {
        const [dir, , ext] = pattern.split("/");
        const kind = pattern.includes(".test.") ? "test" : "spec";
        return file.startsWith(`${dir}/`) && file.endsWith(`.${kind}.${ext.split(".").pop()}`);
      });
    const uncovered = testFilesOnDisk().filter((file) => !covered(file));
    expect(uncovered, `These test files would never run: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("does not depend on an undici major that needs a newer Node than the project supports", () => {
    // jsdom pulls undici transitively; undici 8 requires zstd in node:zlib, which
    // Node 20 does not have, and the failure is a load-time crash with no test output.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const override = pkg?.pnpm?.overrides?.undici;
    expect(override, "package.json must pin undici so jsdom cannot pull a newer major").toBeTruthy();
    expect(String(override)).toMatch(/7/);
  });
});
