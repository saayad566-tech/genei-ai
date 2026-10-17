import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Reachability guard.
 *
 * A server procedure with no caller is not a crash, but it is invisible unfinished
 * work: it looks like a feature and behaves like nothing. This test makes that state
 * explicit. Any procedure that nothing calls must be declared below with a reason, so
 * the set can only grow deliberately — a newly added dead endpoint fails the suite.
 *
 * It is also a check on over-claiming. Endpoints that were described as "wired" have
 * to actually be called by the client, the Python director or the desktop shell.
 */

type Declared = { name: string; reason: string };

/**
 * Procedures that are intentionally API surface with no caller in this repository.
 * Each is a real capability that a client outside this tree (a future admin screen, an
 * external runner, a mobile client) is expected to use; none is wired here.
 */
const DECLARED_UNREACHABLE: Declared[] = [
  { name: "assets.save", reason: "Persisting a generated asset is done by the director job path; this is the manual equivalent for an external client." },
  { name: "projects.create", reason: "The studio creates its project through director.createProject, which also compiles the graph. This is the bare create for an external client." },
  { name: "projects.delete", reason: "Deleting a project is a destructive operation with no UI; it stays API-only until an archive screen needs it." },
  { name: "runners.pair", reason: "Pairing a render runner is an operator action performed by an external runner client, not from this UI." },
  { name: "runners.revoke", reason: "Revoking a runner is the counterpart to pairing and is likewise operator-only." },
  { name: "runners.logs", reason: "Runner logs are read by the runner operator, not by the studio UI." },
  { name: "director.submitProviderVideo", reason: "Submitting to a hosted video provider needs a configured provider key; the studio UI does not offer that path yet." },
  { name: "director.pollProviderVideo", reason: "Polls a hosted provider task; it has no caller until the submit path above is offered." },
  { name: "director.jobs", reason: "Job listing for the orchestration view; the DAG dashboard reads director.getProject and nodeDetails instead." },
  { name: "director.updateJob", reason: "Job state is written by the worker path, not by the client." },
  { name: "director.saveQc", reason: "Quality-control results are written by the review path; this is the manual write used by tooling." },
  { name: "chat.history", reason: "Chat history is owned by the page that hosts AIChatBox, which is a presentational component; wiring persistence is feature work." },
  { name: "chat.clearHistory", reason: "The counterpart to chat.history; same reasoning." },
];

/** Extract every "router.procedure" path declared in routers.ts. */
function extractProcedures(source: string): string[] {
  const lines = source.split("\n");
  const stack: Array<{ indent: number; name: string }> = [];
  const found: string[] = [];
  const routerRe = /^\s*(\w+):\s*router\(\{/;
  const procRe = /^\s*(\w+):\s*(publicProcedure|protectedProcedure)\b/;

  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const router = line.match(routerRe);
    if (router) {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
      stack.push({ indent, name: router[1] });
      continue;
    }
    const proc = line.match(procRe);
    if (proc) {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
      if (stack.length > 0) found.push(`${stack[stack.length - 1].name}.${proc[1]}`);
    }
  }
  return found;
}

function readTree(roots: string[], skipFile: string): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__pycache__" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|py|cjs)$/.test(entry.name) && full !== skipFile) {
        out.push({ file: full, text: fs.readFileSync(full, "utf8") });
      }
    }
  };
  for (const root of roots) walk(root);
  return out;
}

const root = path.resolve(process.cwd());
const routersPath = path.join(root, "server", "routers.ts");

describe("server procedure reachability", () => {
  const procedures = extractProcedures(fs.readFileSync(routersPath, "utf8"));
  const corpus = readTree(["client/src", "ai_director", "desktop", "shared"], routersPath);

  const reachable = (name: string) =>
    corpus.some((entry) => !/\.test\.tsx?$/.test(entry.file) && entry.text.includes(name));

  it("finds the procedures to check", () => {
    expect(procedures.length).toBeGreaterThan(50);
  });

  it("has no undeclared unreachable procedure", () => {
    const declared = new Set(DECLARED_UNREACHABLE.map((entry) => entry.name));
    const undeclared = procedures.filter((name) => !reachable(name) && !declared.has(name));
    expect(undeclared, `Unreachable and undeclared: ${undeclared.join(", ")}. Wire them, remove them, or declare them with a reason.`).toEqual([]);
  });

  it("keeps the declared list honest — nothing on it has quietly become reachable", () => {
    const stale = DECLARED_UNREACHABLE.filter((entry) => reachable(entry.name));
    expect(stale.map((entry) => entry.name), "These are now called by the client and should leave the declared list.").toEqual([]);
  });

  it("declares a reason for every entry", () => {
    for (const entry of DECLARED_UNREACHABLE) {
      expect(entry.reason.length, `${entry.name} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("every declared name really exists as a procedure", () => {
    for (const entry of DECLARED_UNREACHABLE) {
      expect(procedures, `${entry.name} is declared but no longer exists`).toContain(entry.name);
    }
  });
});
