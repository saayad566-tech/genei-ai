export type DirectorShotPlan = {
  shotKey: string;
  sequenceIndex: number;
  prompt: string;
  cameraMotion: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  continuityConstraints: string[];
};

export type DirectorScenePlan = {
  sceneKey: string;
  sceneIndex: number;
  title: string;
  objective: string;
  location: string;
  timeOfDay: string;
  dependencies: string[];
  shots: DirectorShotPlan[];
};

export type DirectorGraphPlan = {
  compilerVersion: string;
  scenes: DirectorScenePlan[];
  logicalNodes: Array<{ id: string; kind: "project" | "scene" | "shot"; dependencies: string[] }>;
};

function narrativeBeats(brief: string) {
  const beats = brief.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
  if (beats.length >= 2) return beats;
  const seed = beats[0] ?? brief.trim();
  return [seed, `The protagonist advances the objective established in ${seed}`, `The story resolves the tension created by ${seed}`];
}

export function compileDirectorGraph(input: { title: string; brief: string; aspectRatio: string; tone?: string }): DirectorGraphPlan {
  const beats = narrativeBeats(input.brief);
  const tone = input.tone ?? "cinematic and immersive";
  const scenes: DirectorScenePlan[] = [];
  const logicalNodes: DirectorGraphPlan["logicalNodes"] = [{ id: "project-root", kind: "project", dependencies: [] }];
  let previousShotKey: string | null = null;
  let previousSceneKey: string | null = null;

  beats.forEach((beat, sceneIndex) => {
    const sceneNumber = sceneIndex + 1;
    const sceneKey = `scene-${sceneNumber}`;
    const sceneDependencies = previousSceneKey ? [previousSceneKey] : [];
    const shots: DirectorShotPlan[] = [
      {
        shotKey: `shot-${sceneNumber}-1`,
        sequenceIndex: 1,
        prompt: `Establish ${beat} with clear geography, subject identity, and a stable handoff frame. Tone: ${tone}. Aspect: ${input.aspectRatio}.`,
        cameraMotion: "smooth_establishing_pan",
        dependencies: previousShotKey ? [previousShotKey] : [],
        acceptanceCriteria: ["Readable spatial geometry", "Stable character identity", "End frame exposes action phase for continuation"],
        continuityConstraints: ["Preserve location, lighting, wardrobe, and camera axis from prior scene"],
      },
      {
        shotKey: `shot-${sceneNumber}-2`,
        sequenceIndex: 2,
        prompt: `Continue the action from ${beat} without resetting motion or gaze. Tone: ${tone}.`,
        cameraMotion: "motivated_tracking",
        dependencies: [`shot-${sceneNumber}-1`],
        acceptanceCriteria: ["Motion continues from the prior shot", "Character and prop identity remain stable", "Dialogue or action beat is legible"],
        continuityConstraints: ["Use the previous shot end boundary as mandatory conditioning"],
      },
      {
        shotKey: `shot-${sceneNumber}-3`,
        sequenceIndex: 3,
        prompt: `Land the scene beat for ${beat} and create a deliberate transition frame into the next scene. Tone: ${tone}.`,
        cameraMotion: "controlled_push_in",
        dependencies: [`shot-${sceneNumber}-2`],
        acceptanceCriteria: ["Narrative beat resolves or escalates clearly", "Final frame can seed the next scene", "No visible continuity or artifact blocker"],
        continuityConstraints: ["Preserve action phase, screen direction, lighting, and audio cursor"],
      },
    ];
    scenes.push({ sceneKey, sceneIndex: sceneNumber, title: beat.slice(0, 120), objective: beat, location: "Cinematic Virtual Studio", timeOfDay: "Day", dependencies: sceneDependencies, shots });
    logicalNodes.push({ id: sceneKey, kind: "scene", dependencies: sceneDependencies });
    for (const shot of shots) {
      logicalNodes.push({ id: shot.shotKey, kind: "shot", dependencies: shot.dependencies });
      previousShotKey = shot.shotKey;
    }
    previousSceneKey = sceneKey;
  });

  return { compilerVersion: "director-graph-v1", scenes, logicalNodes };
}
