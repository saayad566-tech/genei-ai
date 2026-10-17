/**
 * AI reviewer adapter.
 *
 * Inspects generated media with a local vision-language model served over an
 * OpenAI-compatible endpoint (llama.cpp's server, or any compatible runtime).
 *
 * The single most important rule here: a review that did not actually happen is
 * reported as `UNKNOWN`. It is never reported as `PASS`. The deterministic validator
 * and this reviewer are deliberately independent — neither may substitute for the
 * other.
 */

import fs from "node:fs";
import path from "node:path";
import { LogRing, withDeadline, type AdapterGenerateOptions, type AdapterStatus, type ExecutionAdapter } from "./types";

export type ReviewStatus = "PASS" | "REVISE" | "FAIL" | "UNKNOWN";

export type ReviewFinding = {
  status: ReviewStatus;
  score: number;
  issues: string[];
  evidence: string[];
  severity: Array<"low" | "medium" | "high">;
  recommendedFix: string;
  retryRequired: boolean;
  /** Which model produced this, and whether it was actually consulted. */
  model: string;
  inspectedFrames: number;
  reason?: string;
};

export type VlmReviewerConfig = {
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:8080/v1 */
  baseUrl: string;
  /** Model name the server exposes. Empty means "ask the server what it has". */
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const REVIEW_INSTRUCTIONS = `You are a film quality reviewer. You will be shown frames sampled from one generated shot, in order.
Judge only what you can actually see. Do not assume anything about frames you were not shown.

Assess: prompt adherence, character identity and face consistency, clothing, location, props, action,
composition, camera, lighting, style, anatomy, artifacts, temporal consistency (does the subject drift,
fade or morph between frames), unwanted objects, continuity with the described scene, and overall quality.

Reply with ONLY a JSON object:
{
  "status": "PASS" | "REVISE" | "FAIL",
  "score": 0-100,
  "issues": ["short issue names"],
  "evidence": ["what in the frames supports this"],
  "severity": ["low" | "medium" | "high"],
  "recommendedFix": "one sentence",
  "retryRequired": true | false
}
Use "FAIL" for unusable output, "REVISE" for fixable problems, "PASS" only when the shot genuinely holds up.`;

function dataUrl(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Tolerant JSON extraction: models sometimes wrap JSON in prose or fences. */
export function parseReviewResponse(content: string): Omit<ReviewFinding, "model" | "inspectedFrames"> | null {
  if (!content) return null;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    const rawStatus = String(parsed.status ?? "").toUpperCase();
    const status: ReviewStatus = rawStatus === "PASS" || rawStatus === "REVISE" || rawStatus === "FAIL" ? rawStatus : "UNKNOWN";
    const score = Number(parsed.score);
    return {
      status,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
      severity: Array.isArray(parsed.severity) ? (parsed.severity.map(String).filter((s) => ["low", "medium", "high"].includes(s)) as Array<"low" | "medium" | "high">) : [],
      recommendedFix: typeof parsed.recommendedFix === "string" ? parsed.recommendedFix : "",
      retryRequired: Boolean(parsed.retryRequired),
    };
  } catch {
    return null;
  }
}

export class VlmReviewerAdapter implements ExecutionAdapter {
  readonly id = "vlm-reviewer";
  readonly toolId = "qwen3-vl";
  readonly category = "review" as const;
  private readonly logs = new LogRing(200);
  private readonly fetchImpl: typeof fetch;
  private cachedModel: string | null = null;

  constructor(private readonly config: VlmReviewerConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  getLogs(): string[] {
    return this.logs.all();
  }

  private url(suffix: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, "")}${suffix}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    return headers;
  }

  /** Real probe: ask the server for its model list. */
  async healthCheck(): Promise<AdapterStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const response = await this.fetchImpl(this.url("/models"), { headers: this.headers(), signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return { state: "degraded", toolId: this.toolId, message: `The reviewer endpoint answered HTTP ${response.status}.`, checkedAt };
      }
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      const models = (payload.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id));
      this.cachedModel = this.config.model || models[0] || null;
      if (!this.cachedModel) {
        return { state: "degraded", toolId: this.toolId, message: "The reviewer endpoint exposes no model, so reviews cannot run.", checkedAt };
      }
      return {
        state: "ready",
        toolId: this.toolId,
        message: `Reviewer ready using ${this.cachedModel}.`,
        detail: { model: this.cachedModel, availableModels: models.join(", ") },
        checkedAt,
      };
    } catch (error) {
      return {
        state: "stopped",
        toolId: this.toolId,
        message: `The reviewer endpoint is not reachable at ${this.config.baseUrl}. (${error instanceof Error ? error.message : "unknown error"})`,
        checkedAt,
      };
    }
  }

  async getCapabilities(): Promise<Record<string, boolean | string | string[]>> {
    return { available: (await this.healthCheck()).state === "ready", capabilities: ["frame_inspection", "identity_check", "continuity_check", "quality_scoring"] };
  }

  /**
   * Review a shot from its sampled frames. Returns UNKNOWN — never PASS — when the
   * reviewer could not actually inspect anything.
   */
  async review(
    framePaths: string[],
    context: { shotId: string; prompt: string; continuityRequirements?: string[]; criteria?: string[] },
    options: AdapterGenerateOptions = {},
  ): Promise<ReviewFinding> {
    const unusable = (reason: string): ReviewFinding => ({
      status: "UNKNOWN",
      score: 0,
      issues: [],
      evidence: [],
      severity: [],
      recommendedFix: "",
      retryRequired: false,
      model: this.cachedModel ?? this.config.model,
      inspectedFrames: 0,
      reason,
    });

    if (framePaths.length === 0) {
      return unusable("No frames were supplied, so the shot was not inspected.");
    }
    const images = framePaths.map(dataUrl).filter((value): value is string => Boolean(value));
    if (images.length === 0) {
      return unusable("None of the supplied frames could be read from disk.");
    }

    const status = await this.healthCheck();
    if (status.state !== "ready") {
      this.logs.push(`Review skipped: ${status.message}`);
      return unusable(status.message);
    }

    const instruction = [
      REVIEW_INSTRUCTIONS,
      `Shot id: ${context.shotId}`,
      `Intended shot: ${context.prompt}`,
      context.continuityRequirements?.length ? `Must remain consistent with: ${context.continuityRequirements.join("; ")}` : "",
      context.criteria?.length ? `Reviewer criteria: ${context.criteria.join("; ")}` : "",
      `You are being shown ${images.length} frame(s) from this single shot, in chronological order.`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      return await withDeadline(async (signal) => {
        const response = await this.fetchImpl(this.url("/chat/completions"), {
          method: "POST",
          headers: this.headers(),
          signal,
          body: JSON.stringify({
            model: this.cachedModel,
            temperature: 0.1,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: instruction },
                  ...images.map((url) => ({ type: "image_url", image_url: { url } })),
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          this.logs.push(`Reviewer HTTP ${response.status}: ${text.slice(0, 200)}`);
          return unusable(`The reviewer returned HTTP ${response.status}.`);
        }

        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content ?? "";
        const parsed = parseReviewResponse(content);
        if (!parsed) {
          this.logs.push("Reviewer returned a response that could not be read as JSON.");
          return unusable("The reviewer's reply could not be read, so no verdict is being claimed.");
        }

        options.onProgress?.({ percent: 100, stage: "reviewed" });
        return { ...parsed, model: this.cachedModel ?? this.config.model, inspectedFrames: images.length };
      }, { ...options, timeoutMs: options.timeoutMs ?? this.config.timeoutMs ?? 120_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reviewer failure.";
      this.logs.push(message);
      return unusable(message);
    }
  }
}
