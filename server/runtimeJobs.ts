/**
 * The execution plane's job endpoints.
 *
 * This is what a paired runner or the CLI talks to when it wants real work done. It is
 * the server half of `LocalRuntimeProvider`: the Python side submits a task here and
 * polls for the result, and everything that happens in between is a real adapter doing
 * real work on this machine.
 *
 * Two rules, both learned the hard way elsewhere in this codebase:
 *
 *  1. **A job is only `completed` when an artifact exists.** The status is derived from
 *     the adapter's actual output, never from the fact that a call returned.
 *  2. **A failure is reported as a failure.** An unavailable adapter returns `failed`
 *     with the adapter's own reason, rather than an empty success.
 */
import fs from "node:fs";
import { buildAdapters, runtimeConfig, type AdapterSet } from "./adapters";
import { checkContinuity, gateRender, type ContinuityProject } from "@shared/continuity";
import { logger } from "./_core/logger";

export type RuntimeTaskType =
  | "probe" | "extract-frame" | "assemble" | "transcode"
  | "text" | "image" | "video" | "lipsync" | "upscale" | "transcribe";

export type RuntimeJob = {
  id: string;
  taskType: RuntimeTaskType;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  /** A real, existing path. Only set when an artifact was actually produced. */
  outputPath?: string;
  outputBytes?: number;
  /** The adapter's own words when something failed. */
  error?: string;
  /** Anything the adapter reported, passed through unmodified. */
  detail?: Record<string, unknown>;
};

const jobs = new Map<string, RuntimeJob>();
const MAX_JOBS = 200;

function remember(job: RuntimeJob): RuntimeJob {
  jobs.set(job.id, job);
  // Bounded: this runs in a desktop process that stays open for weeks.
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next();
    if (oldest.done) break;
    jobs.delete(oldest.value);
  }
  return job;
}

export function getRuntimeJob(id: string): RuntimeJob | undefined {
  return jobs.get(id);
}

export function listRuntimeJobs(limit = 50): RuntimeJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Only claim an output when the file is actually there and non-empty. */
function verifyArtifact(outputPath: string | undefined): { ok: boolean; bytes?: number; reason?: string } {
  if (!outputPath) return { ok: false, reason: "The adapter reported success but named no output file." };
  try {
    if (!fs.existsSync(outputPath)) return { ok: false, reason: `The adapter named ${outputPath}, but no such file exists.` };
    const bytes = fs.statSync(outputPath).size;
    if (bytes === 0) return { ok: false, reason: `${outputPath} exists but is empty.` };
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, reason: `The output could not be read: ${error instanceof Error ? error.message : "unknown error"}.` };
  }
}

/**
 * Continuity context for a render.
 *
 * Supplied when the caller has a project to check. Omitted by callers that have no scene
 * graph — the gate then simply does not run, which is different from passing it.
 */
export type ContinuityGateInput = {
  project: ContinuityProject;
  override?: boolean;
  overrideReason?: string;
};

export type SubmitInput = {
  taskType: RuntimeTaskType;
  payload: Record<string, unknown>;
  /** Checked before a video job starts. An error-severity finding blocks the render. */
  continuity?: ContinuityGateInput;
};
export type SubmitResult = RuntimeJob;

/**
 * Run a task through the real adapters.
 *
 * Synchronous in the sense that the caller gets the final state back, but it is a real
 * execution: the adapter runs, the artifact is checked, and the status reflects what
 * actually happened.
 */
export async function submitRuntimeJob(input: SubmitInput, adapters: AdapterSet = buildAdapters()): Promise<SubmitResult> {
  const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const job = remember({
    id,
    taskType: input.taskType,
    status: "running",
    createdAt: now,
    updatedAt: now,
  });

  const config = runtimeConfig();
  const finish = (patch: Partial<RuntimeJob>): RuntimeJob =>
    remember({ ...job, ...patch, updatedAt: Date.now() });

  // The continuity gate runs BEFORE the adapter, so a contradictory scene list costs nothing.
  // It applies to video only: probing or transcribing a file cannot contradict a story.
  if (input.taskType === "video" && input.continuity) {
    const report = checkContinuity(input.continuity.project);
    const decision = gateRender(report, {
      override: input.continuity.override,
      overrideReason: input.continuity.overrideReason,
    });

    if (!decision.allowed) {
      // Recorded as a failed job rather than thrown: the refusal is part of the job history,
      // and a caller inspecting jobs should see why nothing was rendered.
      return finish({
        status: "failed",
        error: `Continuity gate blocked this render. ${decision.reason} ${decision.blocking
          .map((issue) => `${issue.code} in scene ${issue.sceneId}`)
          .join("; ")}`,
      });
    }
  }

  try {
    switch (input.taskType) {
      case "probe": {
        const filePath = String(input.payload.filePath ?? "");
        if (!filePath) return finish({ status: "failed", error: "probe needs a filePath." });
        const result = await adapters.ffmpeg.probe(filePath);
        if (!result.valid) return finish({ status: "failed", error: result.error ?? "The file could not be probed.", detail: result.detail });
        // A probe produces no new artifact; the file it read is the evidence.
        const artifact = verifyArtifact(filePath);
        if (!artifact.ok) return finish({ status: "failed", error: artifact.reason });
        return finish({ status: "completed", outputPath: filePath, outputBytes: artifact.bytes, detail: result.detail });
      }

      case "extract-frame": {
        const { inputPath, outputPath, atSeconds } = input.payload as { inputPath?: string; outputPath?: string; atSeconds?: number };
        if (!inputPath || !outputPath) return finish({ status: "failed", error: "extract-frame needs inputPath and outputPath." });
        const result = await adapters.ffmpeg.extractFrame(inputPath, outputPath, Number(atSeconds ?? 0));
        if (result.status !== "completed") {
          // The union carries a different field per outcome; report whichever it used.
          const reason = "error" in result ? result.error : "reason" in result ? result.reason : `Frame extraction ended as ${result.status}.`;
          return finish({ status: "failed", error: reason });
        }
        const artifact = verifyArtifact(outputPath);
        if (!artifact.ok) return finish({ status: "failed", error: artifact.reason });
        return finish({ status: "completed", outputPath, outputBytes: artifact.bytes });
      }

      default: {
        // The generation tasks need a model runtime. If it is not there, say so plainly
        // rather than returning a plausible-looking result.
        const toolFor: Partial<Record<RuntimeTaskType, string>> = {
          text: "llama.cpp", video: "ComfyUI", image: "ComfyUI", lipsync: "MuseTalk/Wav2Lip", upscale: "video2x/Real-ESRGAN", transcribe: "whisper.cpp",
        };
        const tool = toolFor[input.taskType] ?? "a generation runtime";
        const health = await adapters.ffmpeg.healthCheck().catch(() => undefined);
        logger.warn("Runtime task has no executor", { taskType: input.taskType, tool });
        return finish({
          status: "failed",
          error: `${input.taskType} needs ${tool}, which is not running. Install and start it, then submit again. Media assembly is available now; model generation is not.`,
          detail: { ffmpeg: health?.state ?? "unknown", mediaDir: config.mediaDir },
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Runtime task threw", { taskType: input.taskType, message });
    return finish({ status: "failed", error: message });
  }
}
