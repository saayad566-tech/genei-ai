import { describe, expect, it } from "vitest";
import { compileDirectorGraph } from "./directorCompiler";

describe("Director graph compiler", () => {
  it("compiles multiple narrative beats into scenes, shots, and chained dependencies", () => {
    const plan = compileDirectorGraph({ title: "Continuity test", brief: "A runner enters the city. The runner crosses the bridge. The runner reaches the tower.", aspectRatio: "16:9" });
    expect(plan.compilerVersion).toBe("director-graph-v1");
    expect(plan.scenes.length).toBe(3);
    expect(plan.scenes[0].shots.length).toBe(3);
    expect(plan.scenes[1].dependencies).toEqual(["scene-1"]);
    expect(plan.scenes[1].shots[0].dependencies).toEqual(["shot-1-3"]);
    expect(plan.logicalNodes.find((node) => node.id === "shot-2-1")?.dependencies).toEqual(["shot-1-3"]);
  });

  it("creates a bounded multi-scene plan for a short brief instead of one uncontrolled call", () => {
    const plan = compileDirectorGraph({ title: "Short", brief: "A character walks.", aspectRatio: "9:16" });
    expect(plan.scenes.length).toBe(3);
    expect(plan.scenes.every((scene) => scene.shots.length === 3)).toBe(true);
    expect(plan.logicalNodes.filter((node) => node.kind === "shot").length).toBe(9);
  });
});
