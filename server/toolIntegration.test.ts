import { describe, expect, it } from "vitest";
import { TOOL_REGISTRY } from "./modelRegistry";
import { buildAdapters, TOOL_BINDINGS, unservedTools } from "./adapters";
import { WEIGHT_CATALOGUE } from "./modelWeights";

/**
 * Tool integration guard.
 *
 * The failure this prevents is specific and easy to ship by accident: a tool listed in
 * the Model Library that can be "installed" and then does nothing, because no adapter,
 * workflow or endpoint can actually run it. Every registered tool must be served, and
 * every tool that needs weights must name where they come from.
 */

const registryIds = TOOL_REGISTRY.map((tool) => tool.id);

describe("every registered tool is actually served", () => {
  it("has no registry tool without a runtime", () => {
    const unserved = unservedTools(registryIds);
    expect(unserved, `These tools are listed but nothing can run them: ${unserved.join(", ")}`).toEqual([]);
  });

  it("names a runtime that exists in the adapter set", () => {
    const adapters = buildAdapters();
    const available = new Set(Object.keys(adapters));
    for (const binding of TOOL_BINDINGS) {
      for (const key of binding.servedBy) {
        expect(available, `${binding.toolId} is served by "${key}", which is not an adapter`).toContain(key);
      }
    }
  });

  it("declares every binding against a tool that is really registered", () => {
    for (const binding of TOOL_BINDINGS) {
      expect(registryIds, `${binding.toolId} is bound but not in the registry`).toContain(binding.toolId);
    }
  });

  it("binds every registry tool exactly once", () => {
    const bound = TOOL_BINDINGS.map((binding) => binding.toolId);
    expect(new Set(bound).size, "a tool is bound more than once").toBe(bound.length);
    expect([...bound].sort()).toEqual([...registryIds].sort());
  });

  it("explains how each tool is served, not just that it is", () => {
    for (const binding of TOOL_BINDINGS) {
      expect(binding.note.length, `${binding.toolId} needs a real explanation`).toBeGreaterThan(30);
      expect(["adapter", "workflow-host", "openai-endpoint"]).toContain(binding.via);
    }
  });

  it("proves the check fails when a tool is left unserved", () => {
    // The guard is only worth having if it fires.
    expect(unservedTools(["not-a-real-tool"])).toEqual(["not-a-real-tool"]);
  });
});

describe("every tool that needs weights can resolve them", () => {
  const catalogueToolIds = new Set(WEIGHT_CATALOGUE.map((entry) => entry.toolId));

  /**
   * Tools that deliberately have no default repository. They declare
   * `requiresWeightSource`, which means the user names the source at install time — the
   * supported path, not a gap. Anything newly added here needs a reason.
   */
  const USER_SUPPLIED_BY_DESIGN: Record<string, string> = {
    video2x: "Video2X ships its upscaling models with the release and also accepts any Real-ESRGAN/Real-CUGAN model the user points it at, so no single repository is the right default.",
  };

  const needsWeights = TOOL_REGISTRY.filter((tool) => tool.requiresWeightSource || tool.installKind === "weights").map((tool) => tool.id);

  it("finds the tools that need weights", () => {
    expect(needsWeights.length).toBeGreaterThan(3);
  });

  it("names a source for every one, or declares it user-supplied", () => {
    const uncovered = needsWeights.filter((id) => !catalogueToolIds.has(id) && !(id in USER_SUPPLIED_BY_DESIGN));
    expect(uncovered, `These tools need weights and name no source: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("gives every user-supplied case a reason", () => {
    for (const [toolId, reason] of Object.entries(USER_SUPPLIED_BY_DESIGN)) {
      expect(reason.length, `${toolId} needs a reason`).toBeGreaterThan(40);
      expect(needsWeights, `${toolId} is declared but no longer needs weights`).toContain(toolId);
    }
  });

  it("names a well-formed Hugging Face repository for every catalogue entry", () => {
    for (const entry of WEIGHT_CATALOGUE) {
      expect(entry.repo, `${entry.toolId} repo`).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(entry.role.length, `${entry.toolId} role`).toBeGreaterThan(5);
      expect(entry.note.length, `${entry.toolId} note`).toBeGreaterThan(30);
    }
  });

  it("gives the reviewer both a model and a vision encoder", () => {
    const entries = WEIGHT_CATALOGUE.filter((entry) => entry.toolId === "qwen3-vl");
    expect(entries.length, "the reviewer needs its language model and its mmproj").toBeGreaterThanOrEqual(2);
    const roles = entries.map((entry) => entry.role).join(" ");
    expect(roles).toMatch(/language model/i);
    expect(roles).toMatch(/vision/i);
  });

  it("gives the local Director a model small enough for an ordinary laptop", () => {
    const entry = WEIGHT_CATALOGUE.find((item) => item.toolId === "llama-cpp");
    expect(entry, "llama-cpp needs a named model").toBeTruthy();
    expect(entry!.prefer.source).toMatch(/Q4_K_M/);
  });

  it("covers the video model with an official repository", () => {
    const entry = WEIGHT_CATALOGUE.find((item) => item.toolId === "wan22");
    expect(entry, "wan22 needs a named model").toBeTruthy();
    expect(entry!.repo).toMatch(/^Wan-AI\//);
  });
});
