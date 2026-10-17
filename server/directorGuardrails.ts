/**
 * Director guardrails.
 *
 * Every delegation from the Master AI Director to a sub-model carries a guardrail
 * envelope rather than a bare prompt. This module is the single source of truth for
 * the negative prompt, the safety parameters, the quality thresholds and the
 * provenance record that accompany a shot.
 *
 * It deliberately does not invent anything: a threshold that the caller did not
 * supply stays at the documented default, and a capability that is unknown is
 * reported as "unknown" rather than assumed.
 */

export type SafetyCategory =
  | "sexual_content"
  | "minor_depiction"
  | "graphic_violence"
  | "hate_or_harassment"
  | "real_person_impersonation"
  | "self_harm"
  | "illegal_activity";

export type SafetyParameters = {
  /** Categories the Director will refuse to plan at all. */
  blocked: SafetyCategory[];
  /** Categories that require an explicit user acknowledgement before planning. */
  warn: SafetyCategory[];
  /** Score a shot must reach before it may be approved (0-100). */
  minimumScore: number;
  /** Failure modes that block approval outright, whatever the score. */
  blockingIssues: string[];
  /** Bounded repair attempts. Never unbounded. */
  maxRetries: number;
};

export type ContinuityBinding = {
  /** Canonical record this shot inherits from. */
  subject: string;
  /** Fields that must not change between neighbouring shots. */
  lockedFields: string[];
  /** Reference asset ids (faces, wardrobe, props) to condition on. */
  referenceAssetIds: string[];
  /** Explicit, recorded change of continuity state, if any. */
  intentionalChange?: string;
};

export type ShotGuardrailInput = {
  shotId: string;
  positivePrompt: string;
  /** Shot-specific exclusions appended to the base negative prompt. */
  shotNegativePrompt?: string[];
  continuity?: ContinuityBinding[];
  safety?: Partial<SafetyParameters>;
  provenance?: {
    modelId?: string;
    workflowId?: string;
    seed?: number;
    referenceChecksums?: string[];
  };
};

export type GuardrailEnvelope = {
  shotId: string;
  positivePrompt: string;
  negativePrompt: string;
  continuity: ContinuityBinding[];
  safety: SafetyParameters;
  provenance: Required<NonNullable<ShotGuardrailInput["provenance"]>> & { envelopeVersion: string };
  /** Human-readable warnings surfaced to the user rather than silently applied. */
  warnings: string[];
};

/**
 * Base negative prompt. These are the artefacts that most often make output read as
 * "AI-generated" and are what the quality-control requirement targets: facial
 * distortion, identity drift, fading, warping and temporal flicker.
 */
export const BASE_NEGATIVE_PROMPT = [
  "distorted face",
  "deformed facial features",
  "asymmetric eyes",
  "warped mouth",
  "melted skin",
  "face morphing between frames",
  "identity drift",
  "character changing appearance",
  "extra fingers",
  "extra limbs",
  "malformed hands",
  "duplicate subject",
  "flicker",
  "temporal instability",
  "fading",
  "ghosting",
  "motion smear",
  "jitter",
  "low detail",
  "blurry",
  "oversharpened halos",
  "compression artefacts",
  "watermark",
  "text overlay",
  "logo",
  "signature",
  "wrong aspect ratio",
  "letterboxing",
  "frame borders",
];

export const DEFAULT_SAFETY_PARAMETERS: SafetyParameters = {
  blocked: ["minor_depiction", "self_harm"],
  warn: ["graphic_violence", "real_person_impersonation"],
  minimumScore: 70,
  blockingIssues: ["identity_mismatch", "invalid_media", "black_frames", "av_desync"],
  maxRetries: 3,
};

export const ENVELOPE_VERSION = "guardrails-1.0";

function uniqueNonEmpty<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    // String.prototype.trim widens to `string`; the caller guarantees the members.
    const trimmed = value.trim() as T;
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Assemble the envelope handed to a sub-model. The negative prompt is always the
 * base set plus the shot-specific exclusions, so a shot can never silently drop the
 * quality-control exclusions.
 */
export function buildGuardrailEnvelope(input: ShotGuardrailInput): GuardrailEnvelope {
  const safety: SafetyParameters = {
    ...DEFAULT_SAFETY_PARAMETERS,
    ...input.safety,
    blocked: uniqueNonEmpty<SafetyCategory>([...(input.safety?.blocked ?? DEFAULT_SAFETY_PARAMETERS.blocked)]),
    warn: uniqueNonEmpty<SafetyCategory>([...(input.safety?.warn ?? DEFAULT_SAFETY_PARAMETERS.warn)]),
    blockingIssues: uniqueNonEmpty<string>([...(input.safety?.blockingIssues ?? DEFAULT_SAFETY_PARAMETERS.blockingIssues)]),
  };

  const negativePrompt = uniqueNonEmpty([...BASE_NEGATIVE_PROMPT, ...(input.shotNegativePrompt ?? [])]).join(", ");
  const warnings: string[] = [];

  const positivePrompt = input.positivePrompt.trim();
  if (!positivePrompt) {
    warnings.push("This shot has no positive prompt. Generation will be refused rather than improvised.");
  }
  if (safety.warn.length > 0) {
    warnings.push(`This shot touches categories that need your acknowledgement: ${safety.warn.join(", ")}.`);
  }
  if (safety.maxRetries > 5) {
    warnings.push(`maxRetries is set to ${safety.maxRetries}; the repair loop will stop after this many attempts.`);
  }
  for (const binding of input.continuity ?? []) {
    if (binding.lockedFields.length === 0) {
      warnings.push(`Continuity for "${binding.subject}" locks no fields, so drift between shots cannot be detected.`);
    }
    if (binding.referenceAssetIds.length === 0) {
      warnings.push(`Continuity for "${binding.subject}" has no reference asset, so consistency relies on text alone.`);
    }
  }

  return {
    shotId: input.shotId,
    positivePrompt,
    negativePrompt,
    continuity: input.continuity ?? [],
    safety,
    provenance: {
      modelId: input.provenance?.modelId ?? "",
      workflowId: input.provenance?.workflowId ?? "",
      seed: input.provenance?.seed ?? 0,
      referenceChecksums: input.provenance?.referenceChecksums ?? [],
      envelopeVersion: ENVELOPE_VERSION,
    },
    warnings,
  };
}

/** Refuse to plan a shot whose content falls into a blocked category. */
export function isBlocked(categories: SafetyCategory[], safety: SafetyParameters = DEFAULT_SAFETY_PARAMETERS): boolean {
  return categories.some((category) => safety.blocked.includes(category));
}

/**
 * A take may only be approved when it clears the score, trips none of the blocking
 * issues, and passes both reviewers. UNKNOWN is never treated as a pass.
 */
export function isApprovable(
  review: { status: "PASS" | "REVISE" | "FAIL" | "UNKNOWN"; score: number; issues?: string[] },
  technical: { valid: boolean },
  safety: SafetyParameters = DEFAULT_SAFETY_PARAMETERS,
): { approved: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!technical.valid) reasons.push("The deterministic validator did not confirm a valid media file.");
  if (review.status !== "PASS") reasons.push(`The AI reviewer returned ${review.status}.`);
  if (review.score < safety.minimumScore) reasons.push(`Score ${review.score} is below the required ${safety.minimumScore}.`);
  for (const issue of review.issues ?? []) {
    if (safety.blockingIssues.includes(issue)) reasons.push(`Blocking issue: ${issue}.`);
  }
  return { approved: reasons.length === 0, reasons };
}
