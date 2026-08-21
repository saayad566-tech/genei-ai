import { spawn } from "node:child_process";
import type { DirectorGraphPlan } from "./directorCompiler";

type PythonRaw = {
  compiler: string;
  result: {
    scenes: Array<Record<string, any>>;
    nodes: Array<Record<string, any>>;
    warnings?: string[];
  };
};

function runPython(payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const executable = process.env.AI_DIRECTOR_PYTHON ?? "python3";
    const child = spawn(executable, ["-m", "ai_director.graph_bridge"], { cwd: process.cwd(), env: process.env });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Python Director compiler timed out")); }, 15_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(stderr.trim() || `Python Director compiler exited with ${code ?? "unknown"}`));
      else resolve(stdout);
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function compileDirectorGraphWithPython(input: { projectId: number; title: string; brief: string; aspectRatio: string; fps?: number }): Promise<DirectorGraphPlan> {
  const stdout = await runPython(input);
  const parsed = JSON.parse(stdout.trim()) as PythonRaw;
  const raw = parsed.result;
  const scenes = raw.scenes.map((scene) => ({
    sceneKey: scene.id as string,
    sceneIndex: scene.scene_index as number,
    title: scene.title as string,
    objective: scene.objective as string,
    location: scene.location as string,
    timeOfDay: scene.time_of_day as string,
    dependencies: (scene.contract?.dependency_ids ?? []) as string[],
    shots: (scene.shots ?? []).map((shot: Record<string, any>) => ({
      shotKey: shot.id as string,
      sequenceIndex: shot.sequence_index as number,
      prompt: shot.prompt as string,
      cameraMotion: shot.camera_motion as string,
      dependencies: (shot.contract?.dependency_ids ?? []) as string[],
      acceptanceCriteria: (shot.contract?.acceptance_criteria ?? []) as string[],
      continuityConstraints: (shot.contract?.continuity_constraints ?? []) as string[],
    })),
  }));
  const logicalNodes: DirectorGraphPlan["logicalNodes"] = raw.nodes.map((node) => ({
    id: (node.subject_id as string) ?? (node.node_id as string),
    kind: (node.kind === "scene" ? "scene" : "shot") as "scene" | "shot",
    dependencies: ((node.dependencies ?? []) as string[]).map((dependency) => dependency.replace(/^node_/, "")),
  }));
  logicalNodes.push({ id: "project-root", kind: "project", dependencies: [] });
  return { compilerVersion: `${parsed.compiler}-v1`, scenes, logicalNodes };
}
