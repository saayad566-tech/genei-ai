/**
 * CLI-backed adapters.
 *
 * whisper.cpp, MuseTalk/Wav2Lip, Video2X/Real-ESRGAN and FFmpeg are all driven the
 * same way: probe the binary, build an argument list, run it, stream its output, and
 * only report success when the files it was supposed to write actually exist.
 *
 * The default invocations below are each tool's documented command line. Every one can
 * be overridden with an environment variable, because research tool CLIs do change
 * between versions and a wrong guess is worse than an explicit override.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LogRing, withDeadline, type AdapterGenerateOptions, type AdapterStatus, type ExecutionAdapter, type GenerateOutcome } from "./types";
import { getSharedInstaller } from "../assetDownloader";
import { currentPlatform, resolveInstallPlan } from "../toolReleases";

export type CliToolConfig = {
  /** Where the tool was installed, if it was. */
  installDir?: string;
  /** Extra directories to search for the binary. */
  searchDirs?: string[];
  /** Output directory for produced media. */
  outputDir: string;
  /** Environment override for the binary path. */
  binaryEnvVar?: string;
  /** Environment override for the full argument template. */
  argsEnvVar?: string;
};

export type CliRunResult = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Files that were expected and confirmed to exist. */
  outputs: string[];
  durationMs: number;
};

function envValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** Real probe: resolve the binary and ask it for its version. */
export async function probeCli(binary: string, versionArgs: string[] = ["--help"]): Promise<{ found: boolean; path?: string; version?: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, versionArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      // A binary that answers the spawn but hangs on --help still exists.
      resolve(output.trim() ? { found: true, path: binary, version: output.trim().split(/\r?\n/)[0]?.slice(0, 120) } : { found: false });
    }, 6000);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ found: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // A binary that spawned and exited cleanly exists. Requiring version output
      // would wrongly report a silent-but-working tool as missing.
      const version = output.trim() ? output.trim().split(/\r?\n/)[0]?.slice(0, 120) : undefined;
      resolve(code === 0 || output.trim() ? { found: true, path: binary, version } : { found: false });
    });
  });
}

export abstract class CliAdapter implements ExecutionAdapter {
  abstract readonly id: string;
  abstract readonly toolId: string;
  abstract readonly category: ExecutionAdapter["category"];
  protected readonly logs = new LogRing(200);
  private readonly running = new Map<string, () => void>();

  constructor(protected readonly config: CliToolConfig) {}

  getLogs(): string[] {
    return this.logs.all();
  }

  /** Candidate locations, most specific first. */
  protected binaryCandidates(): string[] {
    const override = envValue(this.config.binaryEnvVar);
    const fromInstall = this.config.installDir ? [path.join(this.config.installDir, this.primaryBinary())] : [];
    const fromDirs = (this.config.searchDirs ?? []).map((dir) => path.join(dir, this.primaryBinary()));
    return [override, ...fromInstall, ...fromDirs, this.primaryBinary()].filter((value): value is string => Boolean(value));
  }

  /** The bare binary name, used for PATH lookups. */
  protected abstract primaryBinary(): string;
  protected versionArgs(): string[] {
    return ["--help"];
  }

  /**
   * Files that must exist for this tool to genuinely be usable.
   *
   * Some tools are driven through an interpreter — MuseTalk and Wav2Lip run under
   * python — so probing the binary only proves the *interpreter* is installed. Without
   * this check the adapter reported "ready" on a machine that had Python and no
   * lip-sync tool at all.
   */
  protected requiredPaths(): string[] {
    return [];
  }

  /** Install through the shared installer, using the resolved plan for this platform. */
  async install(options: { allowElevatedCommands?: boolean } = {}): Promise<AdapterStatus> {
    const { getTool } = await import("../modelRegistry");
    const tool = getTool(this.toolId);
    if (!tool) return { state: "unsupported", toolId: this.toolId, message: `No registry entry exists for ${this.toolId}.`, checkedAt: new Date().toISOString() };
    const plan = await resolveInstallPlan(tool, currentPlatform());
    const record = await getSharedInstaller().installFromPlan(plan, { allowElevatedCommands: options.allowElevatedCommands });
    this.logs.push(`Install ${this.toolId}: ${record.status} — ${record.message}`);
    // Always re-probe: the record is what the installer believes, the probe is the truth.
    return this.healthCheck();
  }

  async healthCheck(): Promise<AdapterStatus> {
    const checkedAt = new Date().toISOString();
    const missing = this.requiredPaths().filter((file) => !fs.existsSync(file));
    for (const candidate of this.binaryCandidates()) {
      const probe = await probeCli(candidate, this.versionArgs());
      if (probe.found) {
        if (missing.length > 0) {
          return {
            state: "not_installed",
            toolId: this.toolId,
            message: `${this.toolId} is not installed: ${missing.map((file) => path.basename(file)).join(", ")} is missing. Its interpreter exists, which is not the same thing. Install it from the Tool Registry.`,
            detail: { binary: probe.path ?? candidate, missing: missing.join(", ") },
            checkedAt,
          };
        }
        return {
          state: "ready",
          toolId: this.toolId,
          message: `${this.toolId} is available.`,
          detail: { binary: probe.path ?? candidate, version: probe.version ?? "unknown" },
          checkedAt,
        };
      }
    }
    return {
      state: "not_installed",
      toolId: this.toolId,
      message: `${this.toolId} was not found. Install it from the Tool Registry, or set ${this.config.binaryEnvVar ?? "the binary path"} to point at it.`,
      checkedAt,
    };
  }

  async getCapabilities(): Promise<Record<string, boolean | string | string[]>> {
    const status = await this.healthCheck();
    return { available: status.state === "ready", capabilities: this.declaredCapabilities() };
  }

  protected abstract declaredCapabilities(): string[];

  /** Build the argument list for one job. */
  protected abstract buildArgs(input: CliJobInput): string[];

  /** Files the job is expected to produce. */
  protected abstract expectedOutputs(input: CliJobInput): string[];

  cancel(jobId: string): boolean {
    const kill = this.running.get(jobId);
    if (!kill) return false;
    kill();
    this.running.delete(jobId);
    this.logs.push(`Cancelled ${jobId}.`);
    return true;
  }

  /** Build the argument list from a job description and run it. */
  async run(input: CliJobInput, options: AdapterGenerateOptions = {}): Promise<GenerateOutcome<CliRunResult>> {
    const override = envValue(this.config.argsEnvVar);
    const args = override ? override.split(/\s+/).filter(Boolean) : this.buildArgs(input);
    return this.execute(input.jobId, args, this.expectedOutputs(input), options);
  }

  /** Run an explicit argument list, verifying that the expected files appear. */
  protected async execute(
    jobId: string,
    args: string[],
    expected: string[],
    options: AdapterGenerateOptions = {},
  ): Promise<GenerateOutcome<CliRunResult>> {
    const startedAt = Date.now();
    const binary = this.binaryCandidates()[0];
    const probe = await probeCli(binary, this.versionArgs());
    if (!probe.found) {
      return {
        status: "unsupported",
        reason: `${this.toolId} is not installed, so this job was not attempted.`,
        logs: this.logs.all(),
        durationMs: Date.now() - startedAt,
      };
    }

    fs.mkdirSync(this.config.outputDir, { recursive: true });
    this.logs.push(`Running ${binary} ${args.join(" ")}`);

    try {
      return await withDeadline(
        (signal) =>
          new Promise<GenerateOutcome<CliRunResult>>((resolve) => {
            const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
            this.running.set(jobId, () => child.kill("SIGTERM"));
            const onAbort = () => child.kill("SIGTERM");
            signal.addEventListener("abort", onAbort, { once: true });

            let stdout = "";
            let stderr = "";
            let lastReported = 0;

            child.stdout.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              stdout += text;
              this.logs.pushMany(text.split(/\r?\n/));
              const percent = extractPercent(text);
              if (percent !== null && percent !== lastReported) {
                lastReported = percent;
                options.onProgress?.({ percent, stage: "running" });
              } else if (percent === null) {
                options.onProgress?.({ percent: null, stage: "running" });
              }
            });
            child.stderr.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              stderr += text;
              this.logs.pushMany(text.split(/\r?\n/));
            });

            const finish = (exitCode: number | null) => {
              this.running.delete(jobId);
              signal.removeEventListener("abort", onAbort);
              const missing = expected.filter((file) => !fs.existsSync(file) || fs.statSync(file).size === 0);
              const durationMs = Date.now() - startedAt;

              if (signal.aborted) {
                resolve({ status: "cancelled", logs: this.logs.all(), durationMs });
                return;
              }
              if (exitCode !== 0) {
                resolve({
                  status: "failed",
                  error: `${this.toolId} exited with code ${exitCode}. ${stderr.trim().split(/\r?\n/).slice(-3).join(" ") || "No error output."}`,
                  logs: this.logs.all(),
                  durationMs,
                });
                return;
              }
              if (missing.length > 0) {
                // Exit code 0 with no file is a failure, not a success.
                resolve({
                  status: "failed",
                  error: `${this.toolId} reported success but did not produce: ${missing.map((file) => path.basename(file)).join(", ")}.`,
                  logs: this.logs.all(),
                  durationMs,
                });
                return;
              }
              options.onProgress?.({ percent: 100, stage: "completed" });
              resolve({
                status: "completed",
                output: { command: binary, args, exitCode, stdout, stderr, outputs: expected, durationMs },
                logs: this.logs.all(),
                durationMs,
              });
            };

            child.on("error", (error) => {
              this.logs.push(`Spawn failed: ${error.message}`);
              finish(-1);
            });
            child.on("close", (code) => finish(code));
          }),
        options,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown CLI failure.";
      this.logs.push(message);
      return { status: "failed", error: message, logs: this.logs.all(), durationMs: Date.now() - startedAt };
    }
  }
}

export type CliJobInput = {
  jobId: string;
  /** Absolute path to the source media. */
  inputPath: string;
  /** Absolute path for the primary output. */
  outputPath: string;
  /** Optional secondary input (e.g. the driving audio for lip sync). */
  secondaryInputPath?: string;
  /** Model file, if the tool needs one. */
  modelPath?: string;
  /** Target resolution label, e.g. "1080p" or "4K". */
  targetResolution?: string;
  /** Extra flags appended verbatim (output options). */
  extraArgs?: string[];
  /**
   * Flags that must precede the input, e.g. `-f lavfi` for a generated source.
   * FFmpeg requires input options before `-i`, so they cannot go in extraArgs.
   */
  preInputArgs?: string[];
};

/** Parse a `NN%` progress token out of a tool's output. */
export function extractPercent(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d{1,3})\s*%/g));
  if (matches.length === 0) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

// ── whisper.cpp: transcription, dialogue timing, subtitles ──────────────────

export class WhisperCppAdapter extends CliAdapter {
  readonly id = "whisper-cpp";
  readonly toolId = "whisper-cpp";
  readonly category = "audio" as const;

  constructor(config: CliToolConfig) {
    super({ ...config, binaryEnvVar: config.binaryEnvVar ?? "GENEI_WHISPER_BIN", argsEnvVar: config.argsEnvVar ?? "GENEI_WHISPER_ARGS" });
  }

  protected primaryBinary(): string {
    // whisper.cpp has shipped the CLI as both `main` and `whisper-cli`.
    return process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  }

  protected declaredCapabilities(): string[] {
    return ["transcribe", "dialogue_timing", "subtitle_timing", "audio_analysis"];
  }

  protected buildArgs(input: CliJobInput): string[] {
    const args = ["-f", input.inputPath, "-oj", "-of", input.outputPath];
    if (input.modelPath) args.push("-m", input.modelPath);
    return [...args, ...(input.extraArgs ?? [])];
  }

  protected expectedOutputs(input: CliJobInput): string[] {
    return [`${input.outputPath}.json`];
  }
}

// ── Lip sync: MuseTalk (primary) and Wav2Lip (fallback) ─────────────────────

export class LipSyncAdapter extends CliAdapter {
  readonly id: string;
  readonly toolId: string;
  readonly category = "lipsync" as const;
  private readonly engine: "musetalk" | "wav2lip";

  constructor(config: CliToolConfig, engine: "musetalk" | "wav2lip" = "musetalk") {
    super({
      ...config,
      binaryEnvVar: config.binaryEnvVar ?? (engine === "musetalk" ? "GENEI_MUSETALK_BIN" : "GENEI_WAV2LIP_BIN"),
      argsEnvVar: config.argsEnvVar ?? (engine === "musetalk" ? "GENEI_MUSETALK_ARGS" : "GENEI_WAV2LIP_ARGS"),
    });
    this.engine = engine;
    this.id = engine;
    this.toolId = engine;
  }

  protected primaryBinary(): string {
    return process.platform === "win32" ? "python.exe" : "python3";
  }

  protected versionArgs(): string[] {
    return ["--version"];
  }

  protected declaredCapabilities(): string[] {
    return ["lipsync"];
  }

  /** The inference script, not just the interpreter that would run it. */
  protected requiredPaths(): string[] {
    if (!this.config.installDir) return [];
    return [this.engine === "musetalk" ? path.join(this.config.installDir, "scripts", "inference.py") : path.join(this.config.installDir, "inference.py")];
  }

  protected buildArgs(input: CliJobInput): string[] {
    if (this.engine === "musetalk") {
      // Documented MuseTalk inference entry point.
      const script = this.config.installDir ? path.join(this.config.installDir, "scripts", "inference.py") : "scripts/inference.py";
      const args = [script, "--video_path", input.inputPath, "--audio_path", input.secondaryInputPath ?? "", "--result_dir", input.outputPath];
      if (input.modelPath) args.push("--model_path", input.modelPath);
      return [...args, ...(input.extraArgs ?? [])];
    }
    // Documented Wav2Lip inference entry point.
    const script = this.config.installDir ? path.join(this.config.installDir, "inference.py") : "inference.py";
    const args = ["--face", input.inputPath, "--audio", input.secondaryInputPath ?? "", "--outfile", input.outputPath];
    if (input.modelPath) args.push("--checkpoint_path", input.modelPath);
    return [...args, ...(input.extraArgs ?? [])];
  }

  protected expectedOutputs(input: CliJobInput): string[] {
    return [input.outputPath];
  }
}

// ── Upscaling: Video2X (primary) and Real-ESRGAN (fallback) ─────────────────

export class UpscalerAdapter extends CliAdapter {
  readonly id: string;
  readonly toolId: string;
  readonly category = "upscale" as const;
  private readonly engine: "video2x" | "real-esrgan";

  constructor(config: CliToolConfig, engine: "video2x" | "real-esrgan" = "video2x") {
    super({
      ...config,
      binaryEnvVar: config.binaryEnvVar ?? (engine === "video2x" ? "GENEI_VIDEO2X_BIN" : "GENEI_REALESRGAN_BIN"),
      argsEnvVar: config.argsEnvVar ?? (engine === "video2x" ? "GENEI_VIDEO2X_ARGS" : "GENEI_REALESRGAN_ARGS"),
    });
    this.engine = engine;
    this.id = engine;
    this.toolId = engine;
  }

  protected primaryBinary(): string {
    return this.engine === "video2x" ? (process.platform === "win32" ? "video2x.exe" : "video2x") : process.platform === "win32" ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan";
  }

  protected declaredCapabilities(): string[] {
    return ["upscale"];
  }

  protected buildArgs(input: CliJobInput): string[] {
    const scale = input.targetResolution === "4K" ? "4" : "2";
    if (this.engine === "video2x") {
      return ["-i", input.inputPath, "-o", input.outputPath, "-s", scale, ...(input.extraArgs ?? [])];
    }
    return ["-i", input.inputPath, "-o", input.outputPath, "-s", scale, ...(input.extraArgs ?? [])];
  }

  protected expectedOutputs(input: CliJobInput): string[] {
    return [input.outputPath];
  }
}

// ── FFmpeg: assembly, transcoding and the deterministic validator ───────────

export class FfmpegAdapter extends CliAdapter {
  readonly id = "ffmpeg";
  readonly toolId = "ffmpeg";
  readonly category = "media" as const;

  constructor(config: CliToolConfig) {
    super({ ...config, binaryEnvVar: config.binaryEnvVar ?? "GENEI_FFMPEG_BIN", argsEnvVar: config.argsEnvVar ?? "GENEI_FFMPEG_ARGS" });
  }

  protected primaryBinary(): string {
    return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  }

  protected versionArgs(): string[] {
    return ["-version"];
  }

  protected declaredCapabilities(): string[] {
    return ["assemble", "transcode", "probe", "validate", "extract_frames"];
  }

  protected buildArgs(input: CliJobInput): string[] {
    // A .txt input is a concat list (the assembly path); anything else is a plain
    // transcode. Using the concat demuxer for a normal media file made every simple
    // conversion fail, which is not a mistake a caller should have to know about.
    const isConcatList = path.extname(input.inputPath).toLowerCase() === ".txt";
    // Input options (including -f for a generated source) must precede -i.
    const before = ["-y", ...(input.preInputArgs ?? [])];
    const head = isConcatList
      ? [...before, "-f", "concat", "-safe", "0", "-i", input.inputPath]
      : [...before, "-i", input.inputPath];
    // Output options must precede the output path, which must come last.
    return [...head, ...(input.extraArgs ?? []), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", input.outputPath];
  }

  /**
   * Extract a single frame at a timestamp. Uses its own argument list because the
   * concat defaults would try to encode a PNG as H.264.
   */
  async extractFrame(inputPath: string, outputPath: string, atSeconds: number, options: AdapterGenerateOptions = {}): Promise<GenerateOutcome<CliRunResult>> {
    const args = ["-y", "-ss", String(Math.max(0, atSeconds)), "-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath];
    return this.execute(`frame-${path.basename(outputPath)}`, args, [outputPath], options);
  }

  protected expectedOutputs(input: CliJobInput): string[] {
    return [input.outputPath];
  }

  /** The deterministic technical validator: read real stream facts from ffprobe. */
  async probe(filePath: string): Promise<{ valid: boolean; detail: Record<string, string | number | boolean>; error?: string }> {
    // Derive ffprobe from the *resolved* ffmpeg so a configured binary path is honoured.
    const resolvedFfmpeg = this.binaryCandidates()[0];
    const ffprobe = resolvedFfmpeg.replace(/ffmpeg(\.exe)?$/, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    if (!fs.existsSync(filePath)) {
      return { valid: false, detail: {}, error: `No file exists at ${filePath}.` };
    }
    return new Promise((resolve) => {
      const child = spawn(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 20_000);
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
      child.on("error", () => {
        clearTimeout(timer);
        resolve({ valid: false, detail: {}, error: `ffprobe could not be run: ${err || "not installed"}` });
      });
      child.on("close", () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(out) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
          const video = parsed.streams?.find((stream) => stream.codec_type === "video");
          const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
          if (!video) return resolve({ valid: false, detail: {}, error: "The file contains no video stream." });
          const duration = Number(parsed.format?.duration ?? video.duration ?? 0);
          return resolve({
            valid: duration > 0,
            detail: {
              codec: String(video.codec_name ?? "unknown"),
              width: Number(video.width ?? 0),
              height: Number(video.height ?? 0),
              fps: Number(video.r_frame_rate ? evalFraction(String(video.r_frame_rate)) : 0),
              durationSeconds: Number(duration.toFixed(3)),
              hasAudio: Boolean(audio),
              audioCodec: String(audio?.codec_name ?? "none"),
              sizeBytes: Number(parsed.format?.size ?? 0),
            },
          });
        } catch {
          resolve({ valid: false, detail: {}, error: "ffprobe returned output that could not be read as JSON." });
        }
      });
    });
  }
}

/** ffprobe reports frame rates as "24000/1001"; convert without eval. */
export function evalFraction(value: string): number {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator)) return 0;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  return numerator / denominator;
}
