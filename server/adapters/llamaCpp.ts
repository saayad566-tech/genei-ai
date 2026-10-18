/**
 * llama.cpp adapter — the local language model that runs the Director.
 *
 * The registry listed `llama-cpp` from the start, but nothing implemented it, so the
 * local-LLM path in the specification ("Primary Local LLM / Director") had no runtime.
 * This adapter drives `llama-server`, llama.cpp's OpenAI-compatible HTTP server.
 *
 * It is honest by construction:
 *  - `healthCheck` reports `not_installed` when the binary or the model file is absent,
 *    `stopped` when the server is simply not running, and `ready` only when the server
 *    answers its own health endpoint.
 *  - `getCapabilities` advertises vision only when a multimodal projector (mmproj) is
 *    actually configured — a text-only model is never claimed to see images.
 *  - `chat` returns the server's own content; nothing is synthesised if the request
 *    fails.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { AdapterGenerateOptions, AdapterStatus, ExecutionAdapter } from "./types";

export type LlamaCppConfig = {
  /** Where the server listens once started. */
  baseUrl: string;
  /** Path to the llama-server binary. */
  binaryPath: string;
  /** Path to the .gguf language model. */
  modelPath: string;
  /** Optional multimodal projector; its presence is what enables vision. */
  mmprojPath?: string;
  /** Context window to request. */
  contextSize?: number;
  /** GPU layers to offload; -1 means "as many as fit". */
  gpuLayers?: number;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const LOG_LIMIT = 200;

export class LlamaCppAdapter implements ExecutionAdapter {
  readonly id = "llama-cpp";
  readonly toolId = "llama-cpp";
  readonly category = "text" as const;

  private readonly config: LlamaCppConfig;
  private child: ChildProcess | null = null;
  private logs: string[] = [];

  constructor(config: LlamaCppConfig) {
    this.config = config;
  }

  private record(line: string): void {
    this.logs.push(line);
    if (this.logs.length > LOG_LIMIT) this.logs.splice(0, this.logs.length - LOG_LIMIT);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  /** True when both the binary and the model are actually on disk. */
  private missingParts(): string[] {
    const missing: string[] = [];
    if (!this.config.binaryPath || !fs.existsSync(this.config.binaryPath)) missing.push("llama-server binary");
    if (!this.config.modelPath || !fs.existsSync(this.config.modelPath)) missing.push("model file (.gguf)");
    if (this.config.mmprojPath && !fs.existsSync(this.config.mmprojPath)) missing.push("mmproj file (configured but absent)");
    return missing;
  }

  private async probe(): Promise<{ ok: boolean; body?: unknown; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(4000) });
      const body = await response.json().catch(() => undefined);
      return { ok: response.ok, body };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async healthCheck(): Promise<AdapterStatus> {
    const checkedAt = new Date().toISOString();
    const missing = this.missingParts();
    if (missing.length > 0) {
      return {
        state: "not_installed",
        toolId: this.toolId,
        message: `llama.cpp is not ready: ${missing.join(", ")} is missing. Install it from the Tool Registry and point it at a model.`,
        detail: { baseUrl: this.config.baseUrl, missing: missing.join(", ") },
        checkedAt,
      };
    }

    const probe = await this.probe();
    if (probe.ok) {
      return {
        state: "ready",
        toolId: this.toolId,
        message: "The local model server is running.",
        detail: {
          baseUrl: this.config.baseUrl,
          vision: Boolean(this.config.mmprojPath),
          contextSize: this.config.contextSize ?? 4096,
        },
        checkedAt,
      };
    }

    return {
      state: "stopped",
      toolId: this.toolId,
      message: `llama.cpp is installed but the server is not running at ${this.config.baseUrl}. Start it to use the local model.`,
      detail: { baseUrl: this.config.baseUrl, error: probe.error ?? "no response" },
      checkedAt,
    };
  }

  async getCapabilities(): Promise<Record<string, boolean | string | string[]>> {
    const ready = this.missingParts().length === 0;
    return {
      chat: ready,
      completions: ready,
      // Vision is claimed only when a projector is genuinely configured.
      vision: ready && Boolean(this.config.mmprojPath),
      embeddings: ready,
      local: true,
      requiresNetwork: false,
      model: path.basename(this.config.modelPath || "none"),
    };
  }

  /** Start the server if it is not already answering. */
  async start(): Promise<AdapterStatus> {
    const current = await this.healthCheck();
    if (current.state === "ready") return current;
    if (current.state === "not_installed") return current;

    const args = ["-m", this.config.modelPath, "--host", "127.0.0.1", "--port", this.port(), "-c", String(this.config.contextSize ?? 4096)];
    if (this.config.mmprojPath) args.push("--mmproj", this.config.mmprojPath);
    if (typeof this.config.gpuLayers === "number") args.push("-ngl", String(this.config.gpuLayers));

    try {
      this.child = spawn(this.config.binaryPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      this.child.stdout?.on("data", (chunk: Buffer) => this.record(chunk.toString().trim()));
      this.child.stderr?.on("data", (chunk: Buffer) => this.record(chunk.toString().trim()));
      this.child.on("exit", (code) => {
        this.record(`llama-server exited with code ${code}`);
        this.child = null;
      });
    } catch (error) {
      return {
        state: "failed",
        toolId: this.toolId,
        message: `llama-server could not be started: ${error instanceof Error ? error.message : String(error)}`,
        checkedAt: new Date().toISOString(),
      };
    }

    // Wait for it to become healthy rather than assuming it did.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const probe = await this.probe();
      if (probe.ok) {
        return {
          state: "ready",
          toolId: this.toolId,
          message: "The local model server started and is answering.",
          detail: { baseUrl: this.config.baseUrl },
          checkedAt: new Date().toISOString(),
        };
      }
    }

    return {
      state: "failed",
      toolId: this.toolId,
      message: "The local model server did not become healthy within 20 seconds. See the logs for what it reported.",
      checkedAt: new Date().toISOString(),
    };
  }

  stop(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private port(): string {
    try {
      return new URL(this.config.baseUrl).port || "8080";
    } catch {
      return "8080";
    }
  }

  /**
   * A real chat completion. Returns the server's own text, or a failure — never a
   * fabricated answer.
   */
  async chat(
    messages: ChatMessage[],
    options: AdapterGenerateOptions & { maxTokens?: number; temperature?: number } = {},
  ): Promise<{ status: "completed"; content: string } | { status: "failed"; error: string }> {
    const health = await this.healthCheck();
    if (health.state !== "ready") {
      return { status: "failed", error: health.message };
    }

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 120_000),
        body: JSON.stringify({
          messages,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return { status: "failed", error: `The local model returned HTTP ${response.status}. ${text.slice(0, 200)}` };
      }

      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        return { status: "failed", error: "The local model returned no content." };
      }
      return { status: "completed", content };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  async install(options: { allowElevatedCommands?: boolean } = {}): Promise<AdapterStatus> {
    // Same path as every other adapter: resolve the real install plan for this
    // platform, run it through the shared installer, then re-probe. The installer's
    // record is what it believes; the probe is the truth.
    const { getTool } = await import("../modelRegistry");
    const { resolveInstallPlan, currentPlatform } = await import("../toolReleases");
    const { getSharedInstaller } = await import("../assetDownloader");
    const tool = getTool(this.toolId);
    if (!tool) {
      return { state: "unsupported", toolId: this.toolId, message: `No registry entry exists for ${this.toolId}.`, checkedAt: new Date().toISOString() };
    }
    const plan = await resolveInstallPlan(tool, currentPlatform());
    const record = await getSharedInstaller().installFromPlan(plan, { allowElevatedCommands: options.allowElevatedCommands });
    this.record(`Install ${this.toolId}: ${record.status} — ${record.message}`);
    return this.healthCheck();
  }
}
