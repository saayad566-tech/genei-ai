/**
 * Character swap / video-to-video.
 *
 * This is a different product from "plan a new video in the same style". Here the reference
 * video drives everything — motion, camera, lighting, background, pacing — and only the
 * subject changes. The prompt below implements the operator's specification exactly, so the
 * model is told precisely what to preserve and what to replace.
 *
 * The distinction matters and the app keeps it visible:
 *
 *   "similar"   new scenes that follow the source's FORM (pacing, shot count, style)
 *   "replicate" the source's MOTION, recomposed with a different character
 *
 * They are different pipelines with different failure modes, so they are different modes
 * rather than a slider on one.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type SwapMode = "similar" | "replicate";

export type SwapInputs = {
  /** The video whose motion and look must be reproduced. */
  referenceVideoPath: string;
  /** The face/character to place in it. Either an image or a short video. */
  characterReferencePath: string;
  /** Optional wardrobe instruction; the reference character's own clothing applies otherwise. */
  wardrobe?: string;
  /** Optional explicit identity notes that must hold throughout. */
  identityNotes?: string[];
};

export type SwapPrompt = {
  /** The developer/system instruction. */
  system: string;
  /** The user-facing instruction, filled from the actual inputs. */
  user: string;
  /** What must be preserved, as discrete clauses the caller can display. */
  preserve: string[];
  /** What must change. */
  replace: string[];
};

/**
 * The master system prompt.
 *
 * Written as a system instruction because the constraints are role-level: a model that
 * treats them as a user preference will drop motion consistency the moment the character
 * reference is visually dominant.
 */
export const SWAP_SYSTEM_PROMPT = `You are an advanced AI video generation model specialised in video-to-video and character swap.

Task: take the user-uploaded reference video and the user-uploaded character reference, and generate a brand new video that replicates the exact motion, camera angles, lighting, background environment, pacing and overall production quality of the reference video, while seamlessly replacing the primary subject with the new character.

Rules:
* Motion and composition: maintain frame-by-frame motion consistency, camera movement (pans, zooms, tracking), and the spatial layout of the reference video.
* Character consistency: the new character's face, clothing style (where specified) and identity must match the provided character reference accurately, and must not drift across the sequence.
* Quality: preserve the visual fidelity, colour grading, texture and resolution character of the source video.
* Output: produce the final video matching the reference's timing and flow.

Never substitute a different person, never alter the camera path, and never change the background environment.`;

/**
 * Build the user-facing instruction from real inputs.
 *
 * Paths are included as named references rather than inlined data, because the execution
 * plane resolves them; a prompt carrying megabytes of base64 would be rejected by most
 * model servers.
 */
export function buildSwapPrompt(inputs: SwapInputs): SwapPrompt {
  const wardrobe = inputs.wardrobe?.trim();
  const identity = (inputs.identityNotes ?? []).map((n) => n.trim()).filter(Boolean);

  const clauses = [
    `Replicate the exact motion, camera movement, background environment, lighting and pacing of the reference video "${path.basename(inputs.referenceVideoPath)}".`,
    `Replace the main subject in that video with the character from "${path.basename(inputs.characterReferencePath)}".`,
    "Maintain high visual quality, matching lighting, and a consistent identity throughout the sequence.",
  ];

  if (wardrobe) clauses.push(`Wardrobe: ${wardrobe}.`);
  if (identity.length > 0) clauses.push(`Identity must remain identical to: ${identity.join("; ")}.`);

  clauses.push("Do not alter the camera path, the background, or the timing of the reference.");

  return {
    system: SWAP_SYSTEM_PROMPT,
    user: clauses.join(" "),
    preserve: [
      "frame-by-frame motion",
      "camera movement — pans, zooms, tracking",
      "lighting",
      "background environment",
      "pacing and timing",
      "colour grading and texture",
      "spatial layout",
    ],
    replace: [
      "the primary subject's identity",
      wardrobe ? `wardrobe (${wardrobe})` : "wardrobe, per the character reference",
    ],
  };
}

export class SwapInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapInputError";
  }
}

/**
 * Check the two inputs really exist and are usable before a job is submitted.
 *
 * A character-swap job that starts with a missing reference burns GPU time and returns
 * something the user cannot diagnose. Failing here names the file.
 */
export async function validateSwapInputs(inputs: SwapInputs): Promise<{ referenceBytes: number; characterBytes: number }> {
  const check = async (label: string, filePath: string) => {
    if (!filePath || !filePath.trim()) throw new SwapInputError(`A ${label} is required.`);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) throw new SwapInputError(`The ${label} at ${filePath} does not exist.`);
    if (stat.size === 0) throw new SwapInputError(`The ${label} at ${filePath} is empty (0 bytes).`);
    return stat.size;
  };

  const referenceBytes = await check("reference video", inputs.referenceVideoPath);
  const characterBytes = await check("character reference", inputs.characterReferencePath);

  // A character reference must be an image or a short video; anything else cannot carry a face.
  const ext = path.extname(inputs.characterReferencePath).toLowerCase();
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"]);
  if (!allowed.has(ext)) {
    throw new SwapInputError(
      `The character reference must be an image (.jpg, .png, .webp) or a short video (.mp4, .mov, .webm). Got "${ext || "no extension"}".`,
    );
  }

  return { referenceBytes, characterBytes };
}

/** The payload submitted to the execution plane for a swap job. */
export function buildSwapPayload(inputs: SwapInputs): Record<string, unknown> {
  const prompt = buildSwapPrompt(inputs);
  return {
    // Named so the workflow can wire them to its own nodes.
    referenceVideo: inputs.referenceVideoPath,
    characterReference: inputs.characterReferencePath,
    systemPrompt: prompt.system,
    prompt: prompt.user,
    wardrobe: inputs.wardrobe ?? null,
    identityNotes: inputs.identityNotes ?? [],
    // Stated in the payload so the result is self-describing if it is inspected later.
    mode: "replicate",
    preserve: prompt.preserve,
    replace: prompt.replace,
  };
}

/**
 * What a model server must support for this mode to run.
 *
 * Reported to the user when the mode is unavailable, so the message is actionable rather
 * than "not supported".
 */
export const SWAP_REQUIREMENTS = [
  "A video-to-video or face-swap workflow (ComfyUI with a vid2vid / IP-Adapter / face-swap graph is one option).",
  "The workflow must accept both a reference video and a character reference image.",
  "Enough VRAM to hold the reference video's frames plus the identity model.",
] as const;
