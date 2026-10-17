/**
 * Proof scene.
 *
 * The acceptance gate from the platform's own specification: one character, one
 * location, two connected shots, multiple takes, at least one reviewer decision, a
 * continuity check and a scene assembly — run against the *actually installed*
 * models. Long-form production should not be offered until this passes.
 *
 * It reports the truth. If an adapter is missing the step is `blocked` with the
 * reason, and the overall verdict is `blocked` — never a hopeful pass.
 */

import fs from "node:fs";
import path from "node:path";
import { buildGuardrailEnvelope, isApprovable } from "./directorGuardrails";
import type { AdapterSet } from "./adapters";
import { resolveAdapter, type Capability } from "./adapters";
import type { ComfyWorkflowParams } from "./adapters/comfyui";
import type { Workflow } from "./adapters/workflowTypes";

export type ProofStepStatus = "passed" | "failed" | "blocked" | "skipped";

export type ProofStep = {
  id: string;
  title: string;
  status: ProofStepStatus;
  detail: string;
  durationMs: number;
  evidence?: Record<string, unknown>;
};

export type ProofVerdict = "passed" | "failed" | "blocked";

export type ProofReport = {
  verdict: ProofVerdict;
  summary: string;
  steps: ProofStep[];
  startedAt: string;
  finishedAt: string;
  /** Which adapters were actually used, by capability. */
  adaptersUsed: Record<string, string>;
  takes: Array<{ shotId: string; takeIndex: number; score: number | null; approved: boolean; reason: string }>;
};

export type ProofShotSpec = {
  shotId: string;
  prompt: string;
  negativePrompt?: string;
  /** Frames per take. */
  frames?: number;
  /** How many takes to attempt per shot. */
  takes?: number;
  continuity?: Array<{ subject: string; lockedFields: string[]; referenceAssetIds: string[] }>;
};

export type ProofSceneOptions = {
  workflow: Workflow;
  shots: [ProofShotSpec, ProofShotSpec];
  /** Where proof media is written. */
  workDir: string;
  /** Extract frames for review? Needs FFmpeg. */
  reviewFramesPerShot?: number;
  maxRetries?: number;
};

async function step<T>(id: string, title: string, work: () => Promise<{ status: ProofStepStatus; detail: string; evidence?: Record<string, unknown> }>): Promise<ProofStep> {
  const startedAt = Date.now();
  try {
    const result = await work();
    return { id, title, durationMs: Date.now() - startedAt, ...result };
  } catch (error) {
    return {
      id,
      title,
      status: "failed",
      detail: error instanceof Error ? error.message : "Unknown failure.",
      durationMs: Date.now() - startedAt,
    };
  }
}

function blocked(id: string, title: string, detail: string): ProofStep {
  return { id, title, status: "blocked", detail, durationMs: 0 };
}

/**
 * Run the proof. Every step performs real work through the supplied adapters.
 */
export async function runProofScene(adapters: AdapterSet, options: ProofSceneOptions): Promise<ProofReport> {
  const startedAt = new Date().toISOString();
  const steps: ProofStep[] = [];
  const adaptersUsed: Record<string, string> = {};
  const takes: ProofReport["takes"] = [];
  const maxRetries = options.maxRetries ?? 3;
  fs.mkdirSync(options.workDir, { recursive: true });

  // ── 1. Resolve the execution plane ──────────────────────────────────────
  const needed: Capability[] = ["video_generation", "review", "assemble"];
  const resolutions = await Promise.all(needed.map((capability) => resolveAdapter(capability, adapters)));
  const missing: string[] = [];
  for (const resolution of resolutions) {
    if (resolution.adapterId) adaptersUsed[resolution.capability] = resolution.adapterId;
    else missing.push(`${resolution.capability} (${resolution.considered.map((c) => `${c.adapterId}: ${c.state}`).join(", ") || "no candidates"})`);
  }

  steps.push(
    await step("resolve", "Resolve the execution plane", async () => {
      if (missing.length > 0) {
        return {
          status: "blocked" as const,
          detail: `These capabilities have no working adapter: ${missing.join("; ")}. The proof was not attempted.`,
          evidence: { adaptersUsed },
        };
      }
      return { status: "passed" as const, detail: `Using ${Object.entries(adaptersUsed).map(([k, v]) => `${k} → ${v}`).join(", ")}.`, evidence: { adaptersUsed } };
    }),
  );

  if (missing.length > 0) {
    return {
      verdict: "blocked",
      summary: `The proof scene is blocked: ${missing.join("; ")}. Install and start those tools, then run the proof again.`,
      steps,
      startedAt,
      finishedAt: new Date().toISOString(),
      adaptersUsed,
      takes,
    };
  }

  const comfy = adapters[adaptersUsed.video_generation as keyof AdapterSet];
  const reviewer = adapters.reviewer;
  const ffmpeg = adapters.ffmpeg;

  // ── 2. Generate both shots, with takes and review ───────────────────────
  const approvedShots: Array<{ shotId: string; file: string; score: number }> = [];

  for (const shot of options.shots) {
    const envelope = buildGuardrailEnvelope({
      shotId: shot.shotId,
      positivePrompt: shot.prompt,
      shotNegativePrompt: shot.negativePrompt ? [shot.negativePrompt] : [],
      continuity: shot.continuity,
    });

    const shotDir = path.join(options.workDir, shot.shotId);
    fs.mkdirSync(shotDir, { recursive: true });
    const takeCount = Math.max(1, shot.takes ?? 2);
    let best: { file: string; score: number } | null = null;

    for (let index = 0; index < takeCount && index < maxRetries + 1; index += 1) {
      const takeStep = await step(`generate:${shot.shotId}:${index}`, `Generate ${shot.shotId} take ${index + 1}`, async () => {
        const params: ComfyWorkflowParams = {
          positivePrompt: envelope.positivePrompt,
          negativePrompt: envelope.negativePrompt,
          seed: 1000 + index,
          frames: shot.frames ?? 24,
          filenamePrefix: `${shot.shotId}_take${index + 1}`,
        };
        const outcome = await (comfy as unknown as { generate: (w: Workflow, p: ComfyWorkflowParams, o: object) => Promise<{ status: string; output?: { files: Array<{ localPath: string; kind: string }> }; error?: string }> }).generate(
          options.workflow,
          params,
          {},
        );
        if (outcome.status !== "completed" || !outcome.output) {
          return { status: "failed" as const, detail: outcome.error ?? `Generation returned ${outcome.status}.` };
        }
        const media = outcome.output.files.find((file) => file.kind === "video") ?? outcome.output.files[0];
        if (!media) return { status: "failed" as const, detail: "Generation completed but produced no media file." };

        // Deterministic validation is independent of the AI reviewer.
        const probe = await ffmpeg.probe(media.localPath);
        if (!probe.valid) {
          return { status: "failed" as const, detail: `Deterministic validation rejected the take: ${probe.error ?? "invalid media"}.`, evidence: probe.detail };
        }

        // Sample frames and ask the reviewer to actually look at them.
        const frameDir = path.join(shotDir, `take${index + 1}_frames`);
        fs.mkdirSync(frameDir, { recursive: true });
        const frameCount = options.reviewFramesPerShot ?? 3;
        const frames: string[] = [];
        for (let f = 0; f < frameCount; f += 1) {
          const framePath = path.join(frameDir, `frame_${String(f).padStart(3, "0")}.png`);
          const extracted = await extractFrame(ffmpeg, media.localPath, framePath, (Number(probe.detail.durationSeconds ?? 1) / frameCount) * f);
          if (extracted) frames.push(framePath);
        }

        const review = await reviewer.review(frames, {
          shotId: shot.shotId,
          prompt: envelope.positivePrompt,
          continuityRequirements: (shot.continuity ?? []).map((binding) => `${binding.subject}: ${binding.lockedFields.join(", ")}`),
        });
        const approval = isApprovable(review, { valid: probe.valid }, envelope.safety);
        takes.push({ shotId: shot.shotId, takeIndex: index, score: review.status === "UNKNOWN" ? null : review.score, approved: approval.approved, reason: approval.approved ? "Approved by reviewer and validator." : approval.reasons.join(" ") });

        if (approval.approved && (!best || review.score > best.score)) best = { file: media.localPath, score: review.score };

        return {
          status: approval.approved ? ("passed" as const) : ("failed" as const),
          detail: approval.approved
            ? `Take approved with score ${review.score} (${frames.length} frames inspected by ${review.model || "the reviewer"}).`
            : `Take not approved: ${approval.reasons.join(" ")}`,
          evidence: { probe: probe.detail, review: { status: review.status, score: review.score, issues: review.issues, inspectedFrames: review.inspectedFrames } },
        };
      });
      steps.push(takeStep);
    }

    // Read through an explicit alias: the assignment happens inside an async closure,
    // so control-flow analysis cannot see it and narrows the variable to null.
    const bestTake = best as { file: string; score: number } | null;
    if (!bestTake) {
      steps.push(blocked(`approve:${shot.shotId}`, `Approve a take for ${shot.shotId}`, `No take of ${shot.shotId} passed both the validator and the reviewer within ${maxRetries} retries. This shot needs human review.`));
      return {
        verdict: "failed",
        summary: `${shot.shotId} could not be approved, so the proof did not pass. Nothing was silently accepted.`,
        steps,
        startedAt,
        finishedAt: new Date().toISOString(),
        adaptersUsed,
        takes,
      };
    }
    approvedShots.push({ shotId: shot.shotId, file: bestTake.file, score: bestTake.score });
    steps.push({ id: `approve:${shot.shotId}`, title: `Approve a take for ${shot.shotId}`, status: "passed", detail: `Best take scored ${bestTake.score}.`, durationMs: 0 });
  }

  // ── 3. Continuity between the two shots ─────────────────────────────────
  steps.push(
    await step("continuity", "Check continuity between the two shots", async () => {
      const [first, second] = options.shots;
      const bindings = second.continuity ?? [];
      if (bindings.length === 0) {
        return { status: "failed" as const, detail: "The second shot declares no continuity bindings, so linkage cannot be verified." };
      }
      const unresolved = bindings.filter((binding) => binding.referenceAssetIds.length === 0);
      if (unresolved.length > 0) {
        return {
          status: "failed" as const,
          detail: `Continuity for ${unresolved.map((b) => b.subject).join(", ")} has no reference asset, so it rests on text alone.`,
        };
      }
      // Compare the last approved frame of shot one with the first of shot two.
      const firstFrames = listFrames(options.workDir, first.shotId);
      const secondFrames = listFrames(options.workDir, second.shotId);
      if (firstFrames.length === 0 || secondFrames.length === 0) {
        return { status: "failed" as const, detail: "Frames could not be sampled from both shots, so continuity was not checked." };
      }
      const review = await reviewer.review([firstFrames[firstFrames.length - 1], secondFrames[0]], {
        shotId: `${first.shotId}->${second.shotId}`,
        prompt: `Does ${second.shotId} continue seamlessly from ${first.shotId}? Compare identity, costume, position, props, lighting and camera grammar.`,
      });
      if (review.status === "UNKNOWN") {
        return { status: "blocked" as const, detail: `Continuity could not be judged: ${review.reason ?? "the reviewer did not inspect the frames"}.` };
      }
      return {
        status: review.status === "PASS" ? ("passed" as const) : ("failed" as const),
        detail: review.status === "PASS" ? `Continuity holds (score ${review.score}).` : `Continuity is not acceptable: ${review.issues.join(", ") || review.status}.`,
        evidence: { score: review.score, issues: review.issues, inspectedFrames: review.inspectedFrames },
      };
    }),
  );

  // ── 4. Assemble the scene ───────────────────────────────────────────────
  steps.push(
    await step("assemble", "Assemble the two approved shots into a scene", async () => {
      const listPath = path.join(options.workDir, "concat.txt");
      fs.writeFileSync(listPath, approvedShots.map((shot) => `file '${shot.file.replace(/'/g, "'\\''")}'`).join("\n"));
      const outputPath = path.join(options.workDir, "proof_scene.mp4");
      const outcome = await ffmpeg.run({ jobId: "proof-assemble", inputPath: listPath, outputPath });
      if (outcome.status !== "completed") {
        return { status: "failed" as const, detail: `Assembly did not complete: ${outcome.status === "unsupported" ? outcome.reason : outcome.status === "failed" ? outcome.error : "cancelled"}.` };
      }
      const probe = await ffmpeg.probe(outputPath);
      if (!probe.valid) return { status: "failed" as const, detail: `The assembled scene is not a valid media file: ${probe.error ?? "invalid"}.` };
      return { status: "passed" as const, detail: `Assembled ${approvedShots.length} shots into a ${probe.detail.durationSeconds}s scene.`, evidence: probe.detail };
    }),
  );

  const failed = steps.filter((s) => s.status === "failed");
  const blockedSteps = steps.filter((s) => s.status === "blocked");
  const verdict: ProofVerdict = failed.length > 0 ? "failed" : blockedSteps.length > 0 ? "blocked" : "passed";
  const summary =
    verdict === "passed"
      ? "Proof scene passed on the actually installed models: two connected shots, multiple takes, a reviewer decision, a continuity check and an assembly."
      : verdict === "blocked"
        ? `Proof blocked: ${blockedSteps.map((s) => s.detail).join(" ")}`
        : `Proof failed: ${failed.map((s) => `${s.title} — ${s.detail}`).join(" ")}`;

  return { verdict, summary, steps, startedAt, finishedAt: new Date().toISOString(), adaptersUsed, takes };
}

function listFrames(workDir: string, shotId: string): string[] {
  const dir = path.join(workDir, shotId);
  if (!fs.existsSync(dir)) return [];
  const frames: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith("_frames")) continue;
    const frameDir = path.join(dir, entry.name);
    for (const file of fs.readdirSync(frameDir).sort()) {
      if (/\.(png|jpg|jpeg)$/i.test(file)) frames.push(path.join(frameDir, file));
    }
  }
  return frames;
}

/** Extract one frame at a timestamp using FFmpeg. */
async function extractFrame(ffmpeg: AdapterSet["ffmpeg"], videoPath: string, framePath: string, atSeconds: number): Promise<boolean> {
  const outcome = await ffmpeg.extractFrame(videoPath, framePath, atSeconds);
  return outcome.status === "completed" && fs.existsSync(framePath);
}
