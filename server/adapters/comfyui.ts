/**
 * ComfyUI adapter — the real video/image generation engine.
 *
 * Speaks ComfyUI's documented HTTP API directly:
 *   GET  /system_stats        health
 *   POST /prompt              queue a workflow
 *   GET  /history/{prompt_id} poll status and discover outputs
 *   GET  /view                fetch a produced file
 *   POST /interrupt           cancel the running job
 *
 * Workflow parameters are injected by marker substitution first (`{{positive}}`
 * style placeholders are the explicit, deterministic contract), with auto-detection
 * of standard node classes as a fallback. A workflow is only considered to have
 * produced output when a real file was fetched and written to disk.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LogRing, withDeadline, type AdapterGenerateOptions, type AdapterStatus, type ExecutionAdapter, type GenerateOutcome } from "./types";
import type { Workflow } from "./workflowTypes";

export type ComfyWorkflowParams = {
  positivePrompt?: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
  durationSeconds?: number;
  steps?: number;
  cfg?: number;
  filenamePrefix?: string;
  /** Uploaded input images already present in ComfyUI's input directory. */
  images?: Array<{ role: "start" | "end" | "keyframe" | "reference"; filename: string; subfolder?: string }>;
};

export type ComfyOutputFile = {
  filename: string;
  subfolder: string;
  type: string;
  /** Local path after download. */
  localPath: string;
  bytes: number;
  sha256: string;
  kind: "image" | "video" | "audio" | "other";
};

export type ComfyGenerationResult = {
  promptId: string;
  files: ComfyOutputFile[];
  seed: number;
  workflowHash: string;
};

export type ComfyAdapterConfig = {
  /** e.g. http://127.0.0.1:8188 */
  baseUrl: string;
  /** Where produced media is written. */
  outputDir: string;
  /** Milliseconds between history polls. */
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

const KNOWN_TEXT_CLASSES = ["CLIPTextEncode", "CLIPTextEncodeSDXL", "TextEncodeQwenImageEdit", "WanImageToVideoTextEncode"];
const KNOWN_LATENT_CLASSES = ["EmptyLatentImage", "EmptyLatentVideo", "EmptySD3LatentImage", "WanImageToVideo", "Wan22ImageToVideoLatent"];
const KNOWN_SAMPLER_CLASSES = ["KSampler", "KSamplerAdvanced", "SamplerCustom", "KSamplerSelect"];

function isWorkflow(value: unknown): value is Workflow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Substitute `{{token}}` placeholders anywhere in the workflow.
 * Returns the number of substitutions so a caller can tell whether the workflow was
 * actually parameterised — a workflow with no markers is not silently accepted as
 * parameterised.
 */
export function applyMarkers(workflow: Workflow, params: ComfyWorkflowParams): { workflow: Workflow; substitutions: number } {
  const tokens: Record<string, string | number> = {};
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    tokens[key] = value as string | number;
  };
  put("positive", params.positivePrompt);
  put("positivePrompt", params.positivePrompt);
  put("negative", params.negativePrompt);
  put("negativePrompt", params.negativePrompt);
  put("seed", params.seed);
  put("width", params.width);
  put("height", params.height);
  put("frames", params.frames);
  put("length", params.frames);
  put("fps", params.fps);
  put("duration", params.durationSeconds);
  put("steps", params.steps);
  put("cfg", params.cfg);
  put("filenamePrefix", params.filenamePrefix);

  let substitutions = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      const exact = node.match(/^\{\{(\w+)\}\}$/);
      if (exact && tokens[exact[1]] !== undefined) {
        substitutions += 1;
        return tokens[exact[1]];
      }
      return node.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
        if (tokens[key] === undefined) return match;
        substitutions += 1;
        return String(tokens[key]);
      });
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = walk(value);
      return out;
    }
    return node;
  };

  return { workflow: walk(workflow) as Workflow, substitutions };
}

/**
 * Fallback parameterisation for standard ComfyUI graphs: find the usual node classes
 * and set their conventional inputs. Only used when a workflow declares no markers.
 */
export function autoDetectWorkflow(workflow: Workflow, params: ComfyWorkflowParams): { workflow: Workflow; applied: string[] } {
  const next = structuredClone(workflow);
  const applied: string[] = [];
  const textNodes: Array<[string, Workflow[string]]> = [];
  const latentNodes: Array<[string, Workflow[string]]> = [];
  const samplerNodes: Array<[string, Workflow[string]]> = [];

  for (const [id, node] of Object.entries(next)) {
    const cls = node.class_type ?? "";
    if (KNOWN_TEXT_CLASSES.includes(cls)) textNodes.push([id, node]);
    if (KNOWN_LATENT_CLASSES.includes(cls)) latentNodes.push([id, node]);
    if (KNOWN_SAMPLER_CLASSES.includes(cls)) samplerNodes.push([id, node]);
  }

  if (textNodes.length > 0 && params.positivePrompt !== undefined) {
    textNodes[0][1].inputs = { ...textNodes[0][1].inputs, text: params.positivePrompt };
    applied.push(`positive -> ${textNodes[0][0]}`);
  }
  if (textNodes.length > 1 && params.negativePrompt !== undefined) {
    textNodes[1][1].inputs = { ...textNodes[1][1].inputs, text: params.negativePrompt };
    applied.push(`negative -> ${textNodes[1][0]}`);
  }
  for (const [id, node] of samplerNodes) {
    const inputs = { ...node.inputs };
    if (params.seed !== undefined) inputs.seed = params.seed;
    if (params.steps !== undefined && "steps" in inputs) inputs.steps = params.steps;
    if (params.cfg !== undefined && "cfg" in inputs) inputs.cfg = params.cfg;
    node.inputs = inputs;
    applied.push(`sampler -> ${id}`);
  }
  for (const [id, node] of latentNodes) {
    const inputs = { ...node.inputs };
    if (params.width !== undefined && "width" in inputs) inputs.width = params.width;
    if (params.height !== undefined && "height" in inputs) inputs.height = params.height;
    if (params.frames !== undefined && "length" in inputs) inputs.length = params.frames;
    if (params.frames !== undefined && "batch_size" in inputs) inputs.batch_size = 1;
    node.inputs = inputs;
    applied.push(`latent -> ${id}`);
  }
  return { workflow: next, applied };
}

/** Build the workflow to submit, preferring explicit markers. */
export function injectWorkflow(template: Workflow, params: ComfyWorkflowParams): { workflow: Workflow; strategy: "markers" | "auto" | "none"; detail: string } {
  const { workflow: marked, substitutions } = applyMarkers(template, params);
  if (substitutions > 0) {
    return { workflow: marked, strategy: "markers", detail: `${substitutions} placeholder(s) substituted.` };
  }
  const { workflow: detected, applied } = autoDetectWorkflow(template, params);
  if (applied.length > 0) return { workflow: detected, strategy: "auto", detail: applied.join(", ") };
  return { workflow: template, strategy: "none", detail: "The workflow declares no markers and no standard nodes were recognised." };
}

function classify(filename: string): ComfyOutputFile["kind"] {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".mkv", ".gif"].includes(ext)) return "video";
  if ([".wav", ".mp3", ".flac", ".ogg"].includes(ext)) return "audio";
  return "other";
}

export class ComfyUiAdapter implements ExecutionAdapter {
  readonly id = "comfyui";
  readonly toolId = "comfyui";
  readonly category = "video" as const;
  private readonly logs = new LogRing(200);
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private currentPromptId: string | null = null;
  private readonly clientId = crypto.randomUUID();

  constructor(private readonly config: ComfyAdapterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.pollIntervalMs = config.pollIntervalMs ?? 1500;
  }

  getLogs(): string[] {
    return this.logs.all();
  }

  private url(suffix: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, "")}${suffix}`;
  }

  /** Real probe against /system_stats. */
  async healthCheck(): Promise<AdapterStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const response = await this.fetchImpl(this.url("/system_stats"), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) {
        return { state: "degraded", toolId: this.toolId, message: `ComfyUI answered HTTP ${response.status} on its status endpoint.`, checkedAt };
      }
      const payload = (await response.json()) as { system?: { comfyui_version?: string; python_version?: string }; devices?: Array<{ name?: string; vram_total?: number }> };
      const device = payload.devices?.[0];
      return {
        state: "ready",
        toolId: this.toolId,
        message: "ComfyUI is reachable and answering.",
        detail: {
          version: payload.system?.comfyui_version ?? "unknown",
          python: payload.system?.python_version ?? "unknown",
          device: device?.name ?? "unknown",
          vramTotalMB: device?.vram_total ? Math.round(device.vram_total / (1024 * 1024)) : 0,
        },
        checkedAt,
      };
    } catch (error) {
      return {
        state: "stopped",
        toolId: this.toolId,
        message: `ComfyUI is not reachable at ${this.config.baseUrl}. Start it, then check again. (${error instanceof Error ? error.message : "unknown error"})`,
        checkedAt,
      };
    }
  }

  /**
   * Capabilities are declared by the workflow template, not assumed. Callers pass the
   * template so the router can pick a model that actually supports the requested
   * conditioning mode.
   */
  async getCapabilities(template?: Workflow): Promise<Record<string, boolean | string | string[]>> {
    const classes = new Set<string>();
    if (template) for (const node of Object.values(template)) if (node.class_type) classes.add(node.class_type);
    const has = (names: string[]) => names.some((name) => classes.has(name));
    const isVideo = has([...KNOWN_LATENT_CLASSES, "VHS_VideoCombine", "SaveAnimatedWEBP", "CreateVideo"]);
    return {
      supportsTextToVideo: isVideo,
      supportsImageToVideo: has(["LoadImage", "WanImageToVideo", "VHS_LoadVideo"]),
      supportsStartFrame: has(["LoadImage"]),
      supportsEndFrame: has(["WanFirstLastFrameToVideo", "LoadImage"]),
      supportsStartEndFrame: has(["WanFirstLastFrameToVideo"]),
      supportsMultipleKeyframes: has(["WanFirstLastFrameToVideo", "VHS_LoadImages"]),
      supportsReferenceFrames: has(["IPAdapter", "LoadImage", "CLIPVisionEncode"]),
      workflowNodes: Array.from(classes).sort(),
    };
  }

  /** Queue a workflow and wait for its outputs. */
  async generate(
    template: Workflow,
    params: ComfyWorkflowParams,
    options: AdapterGenerateOptions = {},
  ): Promise<GenerateOutcome<ComfyGenerationResult>> {
    const startedAt = Date.now();
    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31);
    const injection = injectWorkflow(template, { ...params, seed });
    const workflowHash = crypto.createHash("sha256").update(JSON.stringify(injection.workflow)).digest("hex").slice(0, 16);
    this.logs.push(`Submitting workflow (${injection.strategy}): ${injection.detail}`);

    try {
      return await withDeadline(async (signal) => {
        const submit = await this.fetchImpl(this.url("/prompt"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: injection.workflow, client_id: this.clientId }),
          signal,
        });

        if (!submit.ok) {
          const text = await submit.text().catch(() => "");
          return {
            status: "failed" as const,
            error: `ComfyUI rejected the workflow (HTTP ${submit.status}). ${text.slice(0, 400)}`,
            logs: this.logs.all(),
            durationMs: Date.now() - startedAt,
          };
        }

        const submitted = (await submit.json()) as { prompt_id?: string; node_errors?: Record<string, unknown> };
        const promptId = submitted.prompt_id;
        if (!promptId) {
          return {
            status: "failed" as const,
            error: `ComfyUI accepted the request but returned no prompt id. Node errors: ${JSON.stringify(submitted.node_errors ?? {}).slice(0, 300)}`,
            logs: this.logs.all(),
            durationMs: Date.now() - startedAt,
          };
        }
        this.currentPromptId = promptId;
        this.logs.push(`Queued prompt ${promptId}`);
        options.onProgress?.({ percent: 0, stage: "queued", message: `ComfyUI accepted prompt ${promptId}.` });

        // Poll history until the job reports completion.
        for (;;) {
          if (signal.aborted) return { status: "cancelled" as const, logs: this.logs.all(), durationMs: Date.now() - startedAt };
          await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));

          const historyResponse = await this.fetchImpl(this.url(`/history/${promptId}`), { signal: AbortSignal.timeout(8000) });
          if (!historyResponse.ok) {
            this.logs.push(`History poll returned HTTP ${historyResponse.status}; retrying.`);
            continue;
          }
          const history = (await historyResponse.json()) as Record<string, {
            status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
            outputs?: Record<string, Record<string, Array<{ filename?: string; subfolder?: string; type?: string }>>>;
          }>;
          const entry = history[promptId];
          if (!entry) {
            options.onProgress?.({ percent: null, stage: "queued", message: "Waiting for ComfyUI to pick up the job." });
            continue;
          }

          if (entry.status?.completed === false || entry.status?.status_str === "error") {
            const detail = JSON.stringify(entry.status?.messages ?? []).slice(0, 400);
            return { status: "failed" as const, error: `ComfyUI reported the job failed. ${detail}`, logs: this.logs.all(), durationMs: Date.now() - startedAt };
          }

          if (entry.status?.completed === true) {
            const files = await this.collectOutputs(entry.outputs ?? {}, promptId, signal);
            if (files.length === 0) {
              return {
                status: "failed" as const,
                error: "ComfyUI reported the job complete but produced no retrievable output files.",
                logs: this.logs.all(),
                durationMs: Date.now() - startedAt,
              };
            }
            options.onProgress?.({ percent: 100, stage: "completed", message: `${files.length} output file(s) retrieved.` });
            return {
              status: "completed" as const,
              output: { promptId, files, seed, workflowHash },
              logs: this.logs.all(),
              durationMs: Date.now() - startedAt,
            };
          }

          options.onProgress?.({ percent: null, stage: "running", message: "ComfyUI is rendering." });
        }
      }, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ComfyUI failure.";
      this.logs.push(`Generation failed: ${message}`);
      return { status: "failed", error: message, logs: this.logs.all(), durationMs: Date.now() - startedAt };
    } finally {
      this.currentPromptId = null;
    }
  }

  private async collectOutputs(
    outputs: Record<string, Record<string, Array<{ filename?: string; subfolder?: string; type?: string }>>>,
    promptId: string,
    signal: AbortSignal,
  ): Promise<ComfyOutputFile[]> {
    const destinationDir = path.join(this.config.outputDir, promptId);
    fs.mkdirSync(destinationDir, { recursive: true });
    const files: ComfyOutputFile[] = [];

    for (const [nodeId, byType] of Object.entries(outputs)) {
      for (const [outputType, items] of Object.entries(byType)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!item?.filename) continue;
          const query = new URLSearchParams({
            filename: item.filename,
            subfolder: item.subfolder ?? "",
            type: item.type ?? "output",
          });
          const response = await this.fetchImpl(this.url(`/view?${query.toString()}`), { signal: AbortSignal.timeout(60_000) });
          if (!response.ok) {
            this.logs.push(`Could not retrieve ${item.filename} (HTTP ${response.status}) from node ${nodeId}.`);
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          const localPath = path.join(destinationDir, path.basename(item.filename));
          fs.writeFileSync(localPath, buffer);
          files.push({
            filename: item.filename,
            subfolder: item.subfolder ?? "",
            type: item.type ?? "output",
            localPath,
            bytes: buffer.byteLength,
            sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
            kind: classify(item.filename) !== "other" ? classify(item.filename) : outputType === "gifs" ? "video" : "other",
          });
          this.logs.push(`Retrieved ${item.filename} (${buffer.byteLength} bytes).`);
        }
      }
    }
    return files;
  }

  /** Cancel the running job through ComfyUI's own interrupt endpoint. */
  async cancel(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.url("/interrupt"), { method: "POST", signal: AbortSignal.timeout(5000) });
      this.logs.push(`Interrupt returned HTTP ${response.status}.`);
      return response.ok;
    } catch (error) {
      this.logs.push(`Interrupt failed: ${error instanceof Error ? error.message : "unknown"}`);
      return false;
    }
  }

  /** Live queue depth, for the UI. */
  async queueDepth(): Promise<{ running: number; pending: number } | null> {
    try {
      const response = await this.fetchImpl(this.url("/queue"), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return null;
      const payload = (await response.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
      return { running: payload.queue_running?.length ?? 0, pending: payload.queue_pending?.length ?? 0 };
    } catch {
      return null;
    }
  }
}
