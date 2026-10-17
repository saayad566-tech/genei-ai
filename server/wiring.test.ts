import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appRouter } from "./routers";

// Structural guards for two rules this codebase relies on:
//   1. Every procedure the client calls must exist on the server router.
//   2. No handler may claim an action it does not perform.

const clientSrc = path.resolve(import.meta.dirname, "../client/src");

function clientFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(clientSrc);
  return files;
}

function clientReferencedProcedures(): Set<string> {
  const found = new Set<string>();
  for (const file of clientFiles()) {
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(/\btrpc\.(\w+)\.(\w+)\.(useQuery|useMutation|useInfiniteQuery|useSuspenseQuery)/g)) {
      found.add(`${match[1]}.${match[2]}`);
    }
  }
  return found;
}

describe("client to server procedure wiring", () => {
  it("resolves every client-referenced procedure against the real router", () => {
    const serverProcedures = new Set(Object.keys(appRouter._def.procedures));
    const missing = [...clientReferencedProcedures()].filter((name) => !serverProcedures.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it("finds a substantial number of calls, so the scan itself cannot silently pass", () => {
    expect(clientReferencedProcedures().size).toBeGreaterThan(30);
  });
});

describe("no fabricated action feedback", () => {
  it("no handler claims to be loading something it never loads", () => {
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (/toast\.(info|success)\(\s*`Loading/.test(src)) {
        offenders.push(path.relative(clientSrc, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("automation templates carry real builder payloads, not just display labels", () => {
    const src = fs.readFileSync(path.join(clientSrc, "pages/AutomationCenter.tsx"), "utf8");
    const templates = src.slice(src.indexOf("const workflowTemplates"), src.indexOf("const triggerTypes"));
    const entries = templates.match(/\{ name: /g) ?? [];
    const withIds = templates.match(/triggerId: "/g) ?? [];
    const withActions = templates.match(/actionIds: \[/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(withIds.length).toBe(entries.length);
    expect(withActions.length).toBe(entries.length);
  });

  it("voice templates carry a real editor seed", () => {
    const src = fs.readFileSync(path.join(clientSrc, "pages/VoiceLab.tsx"), "utf8");
    const templates = src.slice(src.indexOf("const podcastTemplates"), src.indexOf("export default function VoiceLab"));
    const entries = templates.match(/\{ name: /g) ?? [];
    const withSeed = templates.match(/seed: "/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(withSeed.length).toBe(entries.length);
  });
});
