/**
 * Visual continuity — how closely a generated take matches the approved reference.
 *
 * This is the half of continuity that compares pixels. The narrative half lives in
 * `shared/continuity.ts` and checks recorded facts; this one needs a model, because nothing
 * else can answer "is this the same face".
 *
 * The governing constraint, and the reason this file is shaped the way it is: **no engine can
 * promise the same face twice.** Every platform that claims it either means "within one
 * generation" or is overstating. So this returns a *similarity score* with a stated basis and
 * its own caveats — never a pass/fail verdict, and never a guarantee.
 *
 * Thresholds follow the convention the field has settled on: 70 is a pass, 85 is strong. The
 * numbers are a review signal, not a gate on their own.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ScoreConfig = { baseUrl: string; model: string; apiKey?: string };

export type ScoreRequest = {
  /** Approved reference image(s) for the character. */
  referencePaths: string[];
  /** The generated still or frame to judge. */
  takePath: string;
  /** Optional identity notes the caller already knows, echoed into the basis. */
  identityNotes?: string[];
};

export type ScoreResult =
  | {
      status: "scored";
      /** 0–100. A similarity signal, not a probability and not a guarantee. */
      score: number;
      band: "strong" | "pass" | "weak";
      /** What the number was computed against — a score with no basis is an opinion. */
      basis: string;
      /** Number of faces the model reported. Two means the score is unreliable. */
      facesDetected: number;
      /** Statements the caller must surface alongside the score. */
      caveats: string[];
      model: string;
    }
  | {
      status: "unavailable";
      reason: string;
      caveats: string[];
    };

export const PASS_THRESHOLD = 70;
export const STRONG_THRESHOLD = 85;

/**
 * Caveats that ship with every score, whether or not the model volunteered them.
 *
 * They are part of the result rather than documentation, because a number shown without them
 * invites exactly the over-trust this feature is supposed to prevent.
 */
export const SCORE_CAVEATS = [
  "This is a similarity signal, not a guarantee that the face is identical.",
  "A low score can be correct: a deliberate angle, lighting change or partial occlusion will lower it.",
  "A high score can be wrong: a different person in similar light can score well.",
] as const;

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export function scoreConfigFromEnv(): ScoreConfig | null {
  const baseUrl = process.env.GENEI_EMBEDDING_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl,
    model: process.env.GENEI_EMBEDDING_MODEL?.trim() || "face-embedding",
    apiKey: process.env.GENEI_EMBEDDING_API_KEY?.trim(),
  };
}

export const SCORER_REQUIREMENT =
  "Set GENEI_EMBEDDING_URL to a face-embedding service that accepts two images and returns a " +
  "similarity score (an OpenAI-compatible /embeddings endpoint over a face model, or a small " +
  "local service wrapping insightface or facenet). Without one, identity cannot be scored — " +
  "and it will not be guessed.";

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function toDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

export function bandFor(score: number): "strong" | "pass" | "weak" {
  if (score >= STRONG_THRESHOLD) return "strong";
  if (score >= PASS_THRESHOLD) return "pass";
  return "weak";
}

/**
 * Parse a scorer reply into a bounded score.
 *
 * Accepts either `{ score: 0-100 }` or `{ similarity: 0-1 }`, because services disagree. A
 * value outside either range is refused rather than clamped: a scorer returning 250 is
 * broken, and silently turning that into 100 would hide it.
 */
export function parseScore(payload: unknown): { score: number; facesDetected: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;

  let score: number | null = null;
  if (typeof raw.score === "number") score = raw.score;
  else if (typeof raw.similarity === "number") score = raw.similarity * 100;
  else if (typeof raw.cosine === "number") score = ((raw.cosine + 1) / 2) * 100; // -1..1 -> 0..100

  if (score === null || !Number.isFinite(score) || score < 0 || score > 100) return null;

  const faces = typeof raw.faces === "number" && Number.isFinite(raw.faces) ? Math.max(0, Math.round(raw.faces)) : 1;

  return { score: Math.round(score * 10) / 10, facesDetected: faces };
}

export async function scoreIdentity(
  request: ScoreRequest,
  config: ScoreConfig | null = scoreConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<ScoreResult> {
  const caveats: string[] = [...SCORE_CAVEATS];

  if (request.referencePaths.length === 0) {
    return { status: "unavailable", reason: "No approved reference image was supplied, so there is nothing to compare against.", caveats };
  }
  if (!config) {
    return { status: "unavailable", reason: SCORER_REQUIREMENT, caveats };
  }

  let takeBuffer: Buffer;
  let referenceBuffer: Buffer;
  try {
    takeBuffer = await fs.readFile(request.takePath);
    referenceBuffer = await fs.readFile(request.referencePaths[0]);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `An image could not be read: ${error instanceof Error ? error.message : "unknown error"}.`,
      caveats,
    };
  }

  if (takeBuffer.length === 0 || referenceBuffer.length === 0) {
    return { status: "unavailable", reason: "One of the images is empty (0 bytes), so there is nothing to compare.", caveats };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/score`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        reference: toDataUrl(referenceBuffer),
        take: toDataUrl(takeBuffer),
        identityNotes: request.identityNotes ?? [],
      }),
    });
  } catch (error) {
    return {
      status: "unavailable",
      reason: `The identity scorer at ${config.baseUrl} could not be reached: ${error instanceof Error ? error.message : "unknown error"}.`,
      caveats,
    };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: `The identity scorer returned ${response.status}. Check that the endpoint accepts two images and returns a similarity.`,
      caveats,
    };
  }

  const payload = await response.json().catch(() => null);
  const parsed = parseScore(payload);
  if (!parsed) {
    return {
      status: "unavailable",
      reason: "The scorer replied with something that is not a bounded similarity score, so no number can be trusted.",
      caveats,
    };
  }

  // A multi-face take is the failure mode the field warns about: the score describes one of
  // them, and nobody knows which.
  if (parsed.facesDetected > 1) {
    caveats.push(
      `The model reported ${parsed.facesDetected} faces in the take. This score describes one of them, and which one is not known — review by eye.`,
    );
  }
  if (parsed.facesDetected === 0) {
    caveats.push("The model reported no face in the take, so this score should be treated as unreliable.");
  }

  return {
    status: "scored",
    score: parsed.score,
    band: bandFor(parsed.score),
    basis: `Compared against ${path.basename(request.referencePaths[0])} using ${config.model}.`,
    facesDetected: parsed.facesDetected,
    caveats,
    model: config.model,
  };
}

/* ------------------------------------------------------------------ *
 * Batch review
 * ------------------------------------------------------------------ */

export type TakeReview = {
  takePath: string;
  result: ScoreResult;
};

export type ReviewSummary = {
  reviews: TakeReview[];
  /** Takes that scored below the pass threshold. */
  belowThreshold: string[];
  /** Takes that could not be scored at all — never counted as passing. */
  unscored: string[];
  note: string;
};

/**
 * Score several takes against one reference.
 *
 * Unscorable takes are counted separately from failures, because "we could not check this"
 * and "we checked this and it is wrong" are different facts and a reviewer needs to tell them
 * apart.
 */
export async function reviewTakes(
  takes: string[],
  referencePaths: string[],
  config: ScoreConfig | null = scoreConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewSummary> {
  const reviews: TakeReview[] = [];
  const belowThreshold: string[] = [];
  const unscored: string[] = [];

  for (const takePath of takes) {
    const result = await scoreIdentity({ referencePaths, takePath }, config, fetchImpl);
    reviews.push({ takePath, result });
    if (result.status === "unavailable") unscored.push(takePath);
    else if (result.band === "weak") belowThreshold.push(takePath);
  }

  const scored = reviews.length - unscored.length;
  return {
    reviews,
    belowThreshold,
    unscored,
    note:
      `${scored} of ${reviews.length} take(s) scored. ` +
      (unscored.length > 0 ? `${unscored.length} could not be scored and are NOT counted as passing. ` : "") +
      (belowThreshold.length > 0 ? `${belowThreshold.length} fell below the ${PASS_THRESHOLD} threshold. ` : "") +
      "A score is one review signal; the decision is yours.",
  };
}
