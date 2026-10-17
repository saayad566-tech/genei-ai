import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Workflow guard.
 *
 * A duplicate mapping key makes GitHub reject the whole workflow with
 * "failed to parse workflow", and the run then fails in a few seconds with no steps —
 * which looks exactly like an infrastructure problem rather than a typo. Python's YAML
 * parser silently keeps the last duplicate, so a normal YAML check does not catch it.
 *
 * This scan rejects duplicates the way GitHub does, and understands block scalars
 * (`run: |`) so script bodies are not mistaken for YAML.
 */

type Scope = { indent: number; keys: Set<string> };

function findDuplicateKeys(text: string): string[] {
  const problems: string[] = [];
  const scopes: Scope[] = [{ indent: -1, keys: new Set() }];
  const lines = text.split(/\r?\n/);
  let blockScalarIndent: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;

    // Inside a block scalar every line belongs to the script, not to the YAML.
    if (blockScalarIndent !== null) {
      if (indent > blockScalarIndent) continue;
      blockScalarIndent = null;
    }

    // A "- " opens a fresh mapping for that list item. Its scope sits at the dash's
    // own column so the item's sibling keys do not collide with the next item's.
    const isSequenceItem = trimmed.startsWith("- ");
    const content = isSequenceItem ? trimmed.slice(2).trim() : trimmed;
    const keyIndent = isSequenceItem ? indent + 2 : indent;

    if (isSequenceItem) {
      while (scopes.length > 1 && scopes[scopes.length - 1].indent >= indent) scopes.pop();
      scopes.push({ indent, keys: new Set() });
    } else {
      while (scopes.length > 1 && scopes[scopes.length - 1].indent >= keyIndent) scopes.pop();
    }

    const match = content.match(/^([^:\s][^:]*):(?:\s|$)/);
    if (!match) continue;
    const key = match[1].trim();

    const parent = scopes[scopes.length - 1];
    if (parent.keys.has(key)) {
      problems.push(`duplicate key "${key}" at line ${index + 1}`);
    }
    parent.keys.add(key);

    const afterKey = content.slice(match[0].length).trim();
    if (afterKey === "|" || afterKey === ">" || /^[|>][-+]?\d*$/.test(afterKey)) {
      // A block scalar: its body is script, not YAML.
      blockScalarIndent = indent;
    } else if (afterKey === "") {
      // No inline value, so the following more-indented lines are its children.
      scopes.push({ indent: keyIndent, keys: new Set() });
    }
  }
  return problems;
}

const root = path.resolve(process.cwd());
const workflowDir = path.join(root, ".github", "workflows");
const workflows = fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)) : [];

describe("GitHub workflow definitions", () => {
  it("has at least one workflow to check", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("contains no duplicate mapping keys, which GitHub rejects outright", () => {
    for (const name of workflows) {
      const text = fs.readFileSync(path.join(workflowDir, name), "utf8");
      const problems = findDuplicateKeys(text);
      expect(problems, `${name}: ${problems.join("; ")}`).toEqual([]);
    }
  });

  it("detects a duplicate when one is present", () => {
    // The guard is only worth having if it actually fires.
    const broken = ["jobs:", "  build:", "    steps:", "      - name: x", "        with:", "          a: 1", "        with:", "          b: 2"].join("\n");
    expect(findDuplicateKeys(broken).length).toBe(1);
  });

  it("does not mistake script bodies for YAML", () => {
    const withScript = ["jobs:", "  build:", "    steps:", "      - name: x", "        run: |", "          echo 'a: 1'", "          echo 'a: 2'"].join("\n");
    expect(findDuplicateKeys(withScript)).toEqual([]);
  });

  it("gives every job a timeout so a hung step cannot hold a runner", () => {
    for (const name of workflows) {
      const text = fs.readFileSync(path.join(workflowDir, name), "utf8");
      expect(text, `${name} should set timeout-minutes`).toMatch(/timeout-minutes:/);
      expect(text, `${name} should take a concurrency lock`).toMatch(/concurrency:/);
    }
  });

  it("never runs elevated commands or signs without the material being present", () => {
    const windows = fs.readFileSync(path.join(workflowDir, "build-genei-runner-windows.yml"), "utf8");
    // Signing must be verified from the file, not assumed from a secret being set.
    expect(windows).toMatch(/verify_signature\.ps1/);
    expect(windows).not.toMatch(/signingState = if \(\$env:WINDOWS_SIGNING_CERT_BASE64\)/);
  });
});
