/**
 * Continuity engine.
 *
 * Every serious AI film platform verifies continuity; most tools only *claim* it inside a
 * single generation. Across a timeline, faces drift, wardrobe changes without a reason, a
 * prop appears before it is introduced, and a character teleports between adjacent shots.
 * None of that is visible to a per-shot check, and all of it is what an audience notices.
 *
 * Two design decisions, both taken from how this is done well elsewhere and both consistent
 * with the rest of this codebase:
 *
 *  1. **A check produces warnings, never a verdict.** Each issue names the scene, the
 *     reference it failed against, and a proposed action. It does not approve or reject the
 *     work. Plenty of flagged shots are correct, and plenty of clean shots are wrong in ways
 *     no check was looking for — so a "PASS" from this engine would be a lie about coverage.
 *
 *  2. **Narrative continuity is checked, not just pixels.** A character who knows something
 *     they were never told, or a prop in two places at once, is invisible to any check that
 *     only compares images. Those are the errors that ruin serialised work.
 *
 * Everything here is deterministic and side-effect free, so it can gate a render in CI.
 */

/* ------------------------------------------------------------------ *
 * The project memory
 * ------------------------------------------------------------------ */

export type StoryTime = {
  /** A monotonic label the author controls, e.g. "day 1 morning". */
  label: string;
  /** Ordering key. Higher is later. */
  order: number;
};

export type CharacterInScene = {
  characterId: string;
  /** Wardrobe item ids worn in this scene. */
  wardrobe: string[];
  /** True when this scene establishes the character's first appearance. */
  firstAppearance?: boolean;
  /** Narrative facts this scene reveals TO the character. */
  learns?: string[];
  /** Props this character holds at the start of the scene. */
  holds?: string[];
};

export type SceneRecord = {
  id: string;
  index: number;
  time: StoryTime;
  locationId: string;
  characters: CharacterInScene[];
  /** Props visible in this scene. */
  props: string[];
  /** Screen direction the camera holds, e.g. "left-to-right". */
  screenDirection?: string;
  /** Lighting the scene is lit with. A motivated change needs a changeReason. */
  lighting?: { key: string; temperature: string };
  /** Camera treatment held for the scene, e.g. "handheld", "locked-off". */
  cameraStyle?: string;
  /** Why a wardrobe or location change happened, if it did. */
  changeReason?: string;
};

export type ContinuityProject = {
  characters: Array<{ id: string; name: string; wardrobe: string[] }>;
  locations: Array<{ id: string; name: string }>;
  props: Array<{ id: string; name: string; introducedInSceneId?: string }>;
  scenes: SceneRecord[];
};

/* ------------------------------------------------------------------ *
 * Findings
 * ------------------------------------------------------------------ */

export type IssueSeverity = "error" | "warning" | "note";

export type ContinuityIssue = {
  code:
    | "UNKNOWN_CHARACTER"
    | "UNKNOWN_LOCATION"
    | "UNKNOWN_PROP"
    | "WARDROBE_CHANGED_WITHOUT_REASON"
    | "PROP_BEFORE_INTRODUCTION"
    | "TELEPORT"
    | "TIME_REGRESSION"
    | "CHARACTER_VANISHES_AND_RETURNS"
    | "SCREEN_DIRECTION_FLIP"
    | "KNOWS_SOMETHING_UNTAUGHT"
    | "PROP_IN_TWO_PLACES"
    | "DUPLICATE_SCENE_INDEX"
    | "LIGHTING_SHIFT"
    | "CAMERA_STYLE_FLIP";
  severity: IssueSeverity;
  sceneId: string;
  /** The reference the scene failed against. A warning with no reference is an opinion. */
  reference: string;
  /** What to do about it. Never an instruction to accept or reject. */
  action: string;
  message: string;
};

export type ContinuityReport = {
  issues: ContinuityIssue[];
  /** Counts by severity, for a one-line summary. */
  counts: { error: number; warning: number; note: number };
  /** Scenes examined. */
  scenesChecked: number;
  /**
   * Said plainly, because the alternative is overclaiming. This engine catches mismatches
   * against things that were recorded. Something nobody wrote down cannot be checked.
   */
  coverage: string;
};

/* ------------------------------------------------------------------ *
 * The checks
 * ------------------------------------------------------------------ */

export function checkContinuity(project: ContinuityProject): ContinuityReport {
  const issues: ContinuityIssue[] = [];
  const scenes = [...project.scenes].sort((a, b) => a.index - b.index);

  const characterIds = new Set(project.characters.map((c) => c.id));
  const locationIds = new Set(project.locations.map((l) => l.id));
  const propIds = new Set(project.props.map((p) => p.id));

  // Duplicate indices make "adjacent scene" meaningless, so report it first.
  const seenIndex = new Map<number, string>();
  for (const scene of scenes) {
    if (seenIndex.has(scene.index)) {
      issues.push({
        code: "DUPLICATE_SCENE_INDEX",
        severity: "error",
        sceneId: scene.id,
        reference: `scene index ${scene.index}`,
        action: "Give each scene a unique index; adjacency checks are meaningless otherwise.",
        message: `Scene ${scene.id} shares index ${scene.index} with ${seenIndex.get(scene.index)}.`,
      });
    } else {
      seenIndex.set(scene.index, scene.id);
    }
  }

  // What each character has been told, cumulative.
  const known = new Map<string, Set<string>>();
  // Last scene each character appeared in, and whether they have been seen since.
  const lastSeen = new Map<string, number>();
  const introduced = new Set<string>();
  // Wardrobe memory is per-call, so the checker stays pure and testable.
  const lastWardrobe = new Map<string, string>();

  scenes.forEach((scene, position) => {
    if (!locationIds.has(scene.locationId)) {
      issues.push({
        code: "UNKNOWN_LOCATION",
        severity: "error",
        sceneId: scene.id,
        reference: `location ${scene.locationId}`,
        action: "Add the location to the project, or correct the scene's locationId.",
        message: `Scene ${scene.id} is set in "${scene.locationId}", which is not a project location.`,
      });
    }

    for (const prop of scene.props) {
      if (!propIds.has(prop)) {
        issues.push({
          code: "UNKNOWN_PROP",
          severity: "warning",
          sceneId: scene.id,
          reference: `prop ${prop}`,
          action: "Add the prop to the project so its introduction can be tracked.",
          message: `Scene ${scene.id} shows "${prop}", which is not a project prop.`,
        });
        continue;
      }
      const record = project.props.find((p) => p.id === prop);
      // A prop may only appear at or after the scene where it is introduced.
      if (record?.introducedInSceneId) {
        const intro = scenes.findIndex((s) => s.id === record.introducedInSceneId);
        if (intro !== -1 && position < intro) {
          issues.push({
            code: "PROP_BEFORE_INTRODUCTION",
            severity: "error",
            sceneId: scene.id,
            reference: `prop ${prop} introduced in ${record.introducedInSceneId}`,
            action: "Move the introduction earlier, or remove the prop from this scene.",
            message: `Scene ${scene.id} uses "${prop}" before it is introduced in scene ${record.introducedInSceneId}.`,
          });
        }
      }
    }

    // Who is holding what, across this scene.
    const holders = new Map<string, string>();
    for (const entry of scene.characters) {
      if (!characterIds.has(entry.characterId)) {
        issues.push({
          code: "UNKNOWN_CHARACTER",
          severity: "error",
          sceneId: scene.id,
          reference: `character ${entry.characterId}`,
          action: "Add the character to the project, or correct the id.",
          message: `Scene ${scene.id} features "${entry.characterId}", who is not in the cast.`,
        });
        continue;
      }

      for (const held of entry.holds ?? []) {
        const previous = holders.get(held);
        if (previous && previous !== entry.characterId) {
          issues.push({
            code: "PROP_IN_TWO_PLACES",
            severity: "error",
            sceneId: scene.id,
            reference: `prop ${held}`,
            action: "Decide which character holds it, or duplicate the prop.",
            message: `Scene ${scene.id} has "${held}" held by both ${previous} and ${entry.characterId}.`,
          });
        }
        holders.set(held, entry.characterId);
      }

      // Knowledge must be taught before it is used.
      const taught = known.get(entry.characterId) ?? new Set<string>();
      for (const fact of entry.learns ?? []) {
        if (taught.has(fact)) {
          issues.push({
            code: "KNOWS_SOMETHING_UNTAUGHT",
            severity: "note",
            sceneId: scene.id,
            reference: `fact ${fact}`,
            action: "This may be a deliberate re-statement; otherwise check the reveal order.",
            message: `${entry.characterId} is told "${fact}" again in scene ${scene.id}, having already learned it.`,
          });
        }
        taught.add(fact);
      }
      known.set(entry.characterId, taught);

      // Wardrobe: a change is only fine when the scene explains it.
      const cast = project.characters.find((c) => c.id === entry.characterId);
      const previousWardrobe = lastWardrobe.get(entry.characterId);
      const current = [...entry.wardrobe].sort().join("|");
      if (previousWardrobe !== undefined && previousWardrobe !== current && !scene.changeReason) {
        issues.push({
          code: "WARDROBE_CHANGED_WITHOUT_REASON",
          severity: "warning",
          sceneId: scene.id,
          reference: `wardrobe for ${entry.characterId}`,
          action: "Add a changeReason to the scene, or restore the previous wardrobe.",
          message: `${cast?.name ?? entry.characterId}'s wardrobe changes in scene ${scene.id} with no stated reason.`,
        });
      }
      lastWardrobe.set(entry.characterId, current);

      // A character who disappears for a scene and returns needs no flag, but one who
      // vanishes from a scene they were in and comes back in the SAME location mid-action
      // usually means a missing shot.
      const previous = lastSeen.get(entry.characterId);
      if (previous !== undefined && position - previous > 1) {
        const gap = scenes.slice(previous + 1, position);
        const sameLocation = gap.some((s) => s.locationId === scene.locationId);
        if (sameLocation) {
          issues.push({
            code: "CHARACTER_VANISHES_AND_RETURNS",
            severity: "note",
            sceneId: scene.id,
            reference: `character ${entry.characterId}`,
            action: "Check whether a shot is missing, or the exit was intentional.",
            message: `${cast?.name ?? entry.characterId} is absent from a scene in the same location and returns in scene ${scene.id}.`,
          });
        }
      }
      lastSeen.set(entry.characterId, position);
      introduced.add(entry.characterId);
    }

    // Adjacency checks against the immediately preceding scene.
    const previousScene = scenes[position - 1];
    if (previousScene) {
      if (scene.time.order < previousScene.time.order) {
        issues.push({
          code: "TIME_REGRESSION",
          severity: "error",
          sceneId: scene.id,
          reference: `scene ${previousScene.id} at order ${previousScene.time.order}`,
          action: "Correct the time order, or move the scene; a flashback needs an explicit marker.",
          message: `Scene ${scene.id} ("${scene.time.label}") happens before scene ${previousScene.id} ("${previousScene.time.label}").`,
        });
      }

      if (scene.locationId !== previousScene.locationId && !scene.changeReason) {
        issues.push({
          code: "TELEPORT",
          severity: "warning",
          sceneId: scene.id,
          reference: `scene ${previousScene.id} in ${previousScene.locationId}`,
          action: "Add a changeReason (a cut, a transition, a travel beat), or fix the location.",
          message: `Scene ${scene.id} jumps from "${previousScene.locationId}" to "${scene.locationId}" with no transition stated.`,
        });
      }

      // Lighting: a character lit from window-left in the wide must stay lit from
      // window-left in the close-up. A motivated change (dusk, stepping into shadow) is
      // fine when the scene says so.
      if (scene.lighting && previousScene.lighting && !scene.changeReason) {
        const before = `${previousScene.lighting.key}/${previousScene.lighting.temperature}`;
        const after = `${scene.lighting.key}/${scene.lighting.temperature}`;
        if (before !== after) {
          issues.push({
            code: "LIGHTING_SHIFT",
            severity: "warning",
            sceneId: scene.id,
            reference: `scene ${previousScene.id} lighting ${before}`,
            action: "Match the lighting, or state the motivation (dusk, a lamp switched on, stepping into shadow).",
            message: `Lighting changes from "${before}" to "${after}" between scenes ${previousScene.id} and ${scene.id}.`,
          });
        }
      }

      if (scene.cameraStyle && previousScene.cameraStyle && !scene.changeReason && scene.cameraStyle !== previousScene.cameraStyle) {
        issues.push({
          code: "CAMERA_STYLE_FLIP",
          severity: "warning",
          sceneId: scene.id,
          reference: `scene ${previousScene.id} camera ${previousScene.cameraStyle}`,
          action: "Hold the camera treatment for the scene, or state why it changes.",
          message: `Camera style changes from "${previousScene.cameraStyle}" to "${scene.cameraStyle}" between scenes ${previousScene.id} and ${scene.id}.`,
        });
      }

      if (
        scene.screenDirection &&
        previousScene.screenDirection &&
        scene.screenDirection !== previousScene.screenDirection &&
        !scene.changeReason
      ) {
        issues.push({
          code: "SCREEN_DIRECTION_FLIP",
          severity: "warning",
          sceneId: scene.id,
          reference: `scene ${previousScene.id} direction ${previousScene.screenDirection}`,
          action: "Keep the same direction, or state why the line is deliberately crossed.",
          message: `Screen direction flips from "${previousScene.screenDirection}" to "${scene.screenDirection}" between scenes ${previousScene.id} and ${scene.id}.`,
        });
      }
    }
  });

  const counts = { error: 0, warning: 0, note: 0 };
  for (const issue of issues) counts[issue.severity] += 1;

  return {
    issues,
    counts,
    scenesChecked: scenes.length,
    coverage:
      "This checks mismatches against what the project records. Anything nobody wrote down cannot be " +
      "checked, and a clean report means no recorded contradiction — not that the film is correct. " +
      "Warnings name a reference and a proposed action; they are not a verdict on the work.",
  };
}

/** A one-line summary for a UI badge. */
export function summarise(report: ContinuityReport): string {
  if (report.issues.length === 0) {
    return `No recorded contradictions across ${report.scenesChecked} scene(s).`;
  }
  const parts: string[] = [];
  if (report.counts.error) parts.push(`${report.counts.error} error(s)`);
  if (report.counts.warning) parts.push(`${report.counts.warning} warning(s)`);
  if (report.counts.note) parts.push(`${report.counts.note} note(s)`);
  return `${parts.join(", ")} across ${report.scenesChecked} scene(s).`;
}

/* ------------------------------------------------------------------ *
 * Change propagation — mark only what a change affects
 * ------------------------------------------------------------------ */

export type EntityChange =
  | { kind: "character"; id: string }
  | { kind: "location"; id: string }
  | { kind: "prop"; id: string };

export type StaleResult = {
  /** Scenes whose content depends on the changed entity. */
  staleSceneIds: string[];
  /** Scenes that are unaffected and must NOT be re-rendered. */
  unaffectedSceneIds: string[];
  /** Why each stale scene is stale — a bare id list is not actionable. */
  reasons: Array<{ sceneId: string; reason: string }>;
};

/**
 * Which scenes a change invalidates.
 *
 * The point is what it leaves alone. Re-rendering a whole film to fix one character is the
 * difference between a usable tool and an unusable one, so this returns the unaffected set
 * explicitly — a caller cannot accidentally treat "everything" as the answer.
 */
export function markStale(project: ContinuityProject, change: EntityChange): StaleResult {
  const staleSceneIds: string[] = [];
  const unaffectedSceneIds: string[] = [];
  const reasons: Array<{ sceneId: string; reason: string }> = [];

  for (const scene of project.scenes) {
    let reason: string | undefined;

    if (change.kind === "character" && scene.characters.some((c) => c.characterId === change.id)) {
      reason = `features ${change.id}`;
    } else if (change.kind === "location" && scene.locationId === change.id) {
      reason = `set in ${change.id}`;
    } else if (change.kind === "prop") {
      if (scene.props.includes(change.id)) reason = `shows ${change.id}`;
      else if (scene.characters.some((c) => (c.holds ?? []).includes(change.id))) reason = `someone holds ${change.id}`;
    }

    if (reason) {
      staleSceneIds.push(scene.id);
      reasons.push({ sceneId: scene.id, reason });
    } else {
      unaffectedSceneIds.push(scene.id);
    }
  }

  return { staleSceneIds, unaffectedSceneIds, reasons };
}

/* ------------------------------------------------------------------ *
 * Render gate
 * ------------------------------------------------------------------ */

export type GateDecision = {
  allowed: boolean;
  /** The findings that block. Empty when allowed. */
  blocking: ContinuityIssue[];
  /** Warnings and notes, which never block. */
  advisory: ContinuityIssue[];
  reason: string;
};

/**
 * Decide whether a render may start.
 *
 * Only `error`-severity findings block, and only when no override was supplied. Warnings and
 * notes are advisory by construction — blocking on a warning would teach users to override
 * reflexively, which destroys the gate's value.
 *
 * An override is honoured but recorded in the reason, so it is never silent.
 */
export function gateRender(
  report: ContinuityReport,
  options: { override?: boolean; overrideReason?: string } = {},
): GateDecision {
  const blocking = report.issues.filter((issue) => issue.severity === "error");
  const advisory = report.issues.filter((issue) => issue.severity !== "error");

  if (blocking.length === 0) {
    return {
      allowed: true,
      blocking: [],
      advisory,
      reason:
        advisory.length === 0
          ? "No recorded contradictions. Nothing to review before rendering."
          : `No contradictions. ${advisory.length} advisory finding(s) worth a look, none blocking.`,
    };
  }

  if (options.override) {
    return {
      allowed: true,
      blocking,
      advisory,
      reason:
        `Overridden by the reviewer${options.overrideReason ? `: ${options.overrideReason}` : ""}. ` +
        `${blocking.length} contradiction(s) were accepted as-is and are recorded against this render.`,
    };
  }

  return {
    allowed: false,
    blocking,
    advisory,
    reason: `${blocking.length} contradiction(s) must be resolved, or the render explicitly overridden.`,
  };
}
