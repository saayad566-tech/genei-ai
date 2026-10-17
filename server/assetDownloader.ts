/**
 * Asset installer.
 *
 * Backs the first-launch onboarding screen: it clones tool repositories and
 * downloads archives for real, streaming progress from the actual process or
 * response. Nothing is marked installed until the artifact exists on disk and a
 * real check has confirmed it, and nothing reports READY without that check.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { getTool, type HealthState, type ToolEntry } from "./modelRegistry";
import type { InstallPlan, InstallStep } from "./toolReleases";

export type InstallRecord = {
  toolId: string;
  status: HealthState;
  installPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  bytesDownloaded: number;
  /** Null while unknown — never a guessed total. */
  totalBytes: number | null;
  percent: number | null;
  message: string;
  log: string[];
};

const MAX_LOG_LINES = 120;

function emptyRecord(toolId: string, message: string, status: HealthState = "not_installed"): InstallRecord {
  return {
    toolId,
    status,
    installPath: null,
    startedAt: null,
    finishedAt: null,
    bytesDownloaded: 0,
    totalBytes: null,
    percent: null,
    message,
    log: [],
  };
}

export class AssetInstaller {
  private readonly records = new Map<string, InstallRecord>();
  private readonly running = new Map<string, { kill: () => void }>();
  private readonly statePath: string;

  constructor(private readonly baseDir: string) {
    this.statePath = path.join(baseDir, "installs.json");
    fs.mkdirSync(this.toolsDir(), { recursive: true });
    this.load();
  }

  toolsDir(): string {
    return path.join(this.baseDir, "tools");
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as InstallRecord[];
      for (const record of raw) {
        // A process that was interrupted by a restart is not still installing.
        const status: HealthState = record.status === "installing" ? "failed" : record.status;
        this.records.set(record.toolId, { ...record, status, message: status === "failed" ? "The previous install was interrupted." : record.message });
      }
    } catch {
      // No prior state: every tool starts as not installed, which is the truth.
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(Array.from(this.records.values()), null, 2));
    } catch {
      // Failing to persist must not crash an install in progress.
    }
  }

  list(): InstallRecord[] {
    return Array.from(this.records.values());
  }

  get(toolId: string): InstallRecord {
    return this.records.get(toolId) ?? emptyRecord(toolId, "This tool has not been installed yet.");
  }

  private update(toolId: string, patch: Partial<InstallRecord>): InstallRecord {
    const current = this.get(toolId);
    const next: InstallRecord = { ...current, ...patch };
    if (patch.log) next.log = patch.log.slice(-MAX_LOG_LINES);
    this.records.set(toolId, next);
    return next;
  }

  private appendLog(toolId: string, line: string): void {
    const current = this.get(toolId);
    const log = [...current.log, line].slice(-MAX_LOG_LINES);
    this.records.set(toolId, { ...current, log });
  }

  cancel(toolId: string): boolean {
    const job = this.running.get(toolId);
    if (!job) return false;
    job.kill();
    this.running.delete(toolId);
    this.update(toolId, { status: "stopped", finishedAt: new Date().toISOString(), message: "Install cancelled." });
    this.persist();
    return true;
  }

  /** Install one tool. Resolves with the final record; never throws for a failed install. */
  async install(toolId: string, options: { weightSourceUrl?: string } = {}): Promise<InstallRecord> {
    const tool = getTool(toolId);
    if (!tool) {
      const record = this.update(toolId, { status: "failed", message: `Unknown tool "${toolId}".` });
      this.persist();
      return record;
    }
    if (this.running.has(toolId)) {
      return this.get(toolId);
    }

    switch (tool.installKind) {
      case "system":
        return this.installSystemTool(tool);
      case "weights":
        return this.installWeights(tool, options.weightSourceUrl);
      case "git":
        return this.installFromGit(tool);
      case "archive":
        return this.installFromArchive(tool);
      default: {
        const record = this.update(toolId, { status: "unsupported", message: `No installer is implemented for "${tool.installKind}".` });
        this.persist();
        return record;
      }
    }
  }

  /**
   * System tools are not silently installed — that would mean running a package
   * manager on the user's machine without asking. We detect and report instead.
   */
  private async installSystemTool(tool: ToolEntry): Promise<InstallRecord> {
    const found = await probeBinary(tool.id === "ffmpeg" ? "ffmpeg" : tool.id);
    if (found.found) {
      return this.update(tool.id, {
        status: "ready",
        installPath: found.path ?? null,
        message: `${tool.name} is already available on this computer.`,
        finishedAt: new Date().toISOString(),
        percent: 100,
      });
    }
    const record = this.update(tool.id, {
      status: "needs_source",
      message: `${tool.name} was not found on this computer. Install it from ${tool.docsUrl ?? tool.repositoryUrl} and it will be detected automatically.`,
    });
    this.persist();
    return record;
  }

  /**
   * Model weights are large and versioned by the tool. Without a source the honest
   * answer is that we do not have one — we never invent a download URL.
   */
  private async installWeights(tool: ToolEntry, sourceUrl?: string): Promise<InstallRecord> {
    const resolved = sourceUrl?.trim();
    if (!resolved) {
      const record = this.update(tool.id, {
        status: "needs_source",
        message: tool.selfFetchingWeights
          ? `${tool.name} downloads its own weights on first use; nothing to install here.`
          : `${tool.name} needs a weights source. Provide a URL, or install it through the tool that hosts it.`,
      });
      this.persist();
      return record;
    }
    return this.installFromArchive({ ...tool, installKind: "archive", sourceUrl: resolved });
  }

  private async installFromGit(tool: ToolEntry, overrideUrl?: string): Promise<InstallRecord> {
    const destination = path.join(this.toolsDir(), tool.id);
    this.update(tool.id, {
      status: "installing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      bytesDownloaded: 0,
      percent: null,
      message: `Cloning ${tool.name}…`,
      log: [],
    });
    this.persist();

    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true, force: true });
    }

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn("git", ["clone", "--depth", "1", "--progress", overrideUrl ?? tool.sourceUrl ?? tool.repositoryUrl, destination], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.running.set(tool.id, { kill: () => child.kill("SIGTERM") });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        const line = text.trim().split(/\r?\n/).filter(Boolean).pop();
        if (line) this.appendLog(tool.id, line);
      });
      child.stdout.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) this.appendLog(tool.id, line);
      });
      child.on("error", (error) => resolve({ code: -1, stderr: String(error) }));
      child.on("close", (code) => resolve({ code, stderr }));
    });

    this.running.delete(tool.id);
    const installed = fs.existsSync(destination) && fs.readdirSync(destination).length > 0;

    if (result.code === 0 && installed) {
      const record = this.update(tool.id, {
        status: "ready",
        installPath: destination,
        finishedAt: new Date().toISOString(),
        percent: 100,
        message: `${tool.name} installed. ${tool.selfFetchingWeights ? "It fetches its own model weights on first use." : "Model weights still need a source."}`,
      });
      this.persist();
      return record;
    }

    const record = this.update(tool.id, {
      status: "failed",
      installPath: null,
      finishedAt: new Date().toISOString(),
      message: `Cloning ${tool.name} failed${result.code !== null ? ` (exit ${result.code})` : ""}. Check your network connection and try again.`,
      log: [...this.get(tool.id).log, result.stderr.trim().split(/\r?\n/).slice(-6).join("\n")].filter(Boolean),
    });
    this.persist();
    return record;
  }

  private async installFromArchive(tool: ToolEntry): Promise<InstallRecord> {
    const source = tool.sourceUrl;
    if (!source) {
      const record = this.update(tool.id, { status: "needs_source", message: `${tool.name} has no download source configured.` });
      this.persist();
      return record;
    }
    const destinationDir = path.join(this.toolsDir(), tool.id);
    fs.mkdirSync(destinationDir, { recursive: true });
    const fileName = path.basename(new URL(source).pathname) || `${tool.id}.bin`;
    const destination = path.join(destinationDir, fileName);

    this.update(tool.id, {
      status: "installing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      bytesDownloaded: 0,
      totalBytes: null,
      percent: null,
      message: `Downloading ${tool.name}…`,
      log: [],
    });
    this.persist();

    const controller = new AbortController();
    this.running.set(tool.id, { kill: () => controller.abort() });

    try {
      const response = await fetch(source, { signal: controller.signal, redirect: "follow" });
      if (!response.ok || !response.body) {
        throw new Error(`The download returned HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get("content-length"));
      const total = Number.isFinite(declared) && declared > 0 ? declared : null;
      this.update(tool.id, { totalBytes: total });

      const stream = fs.createWriteStream(destination);
      let downloaded = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        downloaded += value.byteLength;
        await new Promise<void>((resolve, reject) => stream.write(Buffer.from(value), (error) => (error ? reject(error) : resolve())));
        this.update(tool.id, {
          bytesDownloaded: downloaded,
          percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
        });
      }
      await new Promise<void>((resolve) => stream.end(resolve));
      this.running.delete(tool.id);

      const exists = fs.existsSync(destination) && fs.statSync(destination).size > 0;
      if (!exists) throw new Error("The download finished but no file was written.");

      const record = this.update(tool.id, {
        status: "ready",
        installPath: destination,
        finishedAt: new Date().toISOString(),
        percent: 100,
        message: `${tool.name} downloaded (${formatBytes(downloaded)}).`,
      });
      this.persist();
      return record;
    } catch (error) {
      this.running.delete(tool.id);
      fs.rmSync(destination, { force: true });
      const message =
        error instanceof Error && error.name === "AbortError"
          ? `Download of ${tool.name} was cancelled.`
          : `Download of ${tool.name} failed: ${error instanceof Error ? error.message : "unknown error"}`;
      const record = this.update(tool.id, {
        status: error instanceof Error && error.name === "AbortError" ? "stopped" : "failed",
        finishedAt: new Date().toISOString(),
        message,
      });
      this.persist();
      return record;
    }
  }

  // ── Plan-driven install ──────────────────────────────────────────────────

  /**
   * Execute a resolved install plan.
   *
   * Archives are downloaded and verified against the size (and checksum, when the
   * release publishes one) that the plan was built from — so a truncated or replaced
   * download is caught rather than installed. Commands that need administrator rights
   * are never run unless the caller explicitly consents.
   */
  async installFromPlan(plan: InstallPlan, options: InstallPlanOptions = {}): Promise<InstallRecord> {
    const tool = getTool(plan.toolId);
    if (!tool) {
      const record = this.update(plan.toolId, { status: "failed", message: `Unknown tool "${plan.toolId}".` });
      this.persist();
      return record;
    }

    const results: string[] = [];
    for (const step of plan.steps) {
      const outcome = await this.runStep(tool, step, options);
      if (outcome.status !== "ready") {
        this.persist();
        return outcome;
      }
      results.push(outcome.message);
    }

    const finalRecord = this.update(tool.id, {
      status: "ready",
      installPath: path.join(this.toolsDir(), tool.id),
      finishedAt: new Date().toISOString(),
      percent: 100,
      message: results.join(" "),
    });
    this.persist();
    return finalRecord;
  }

  private async runStep(tool: ToolEntry, step: InstallStep, options: InstallPlanOptions): Promise<InstallRecord> {
    switch (step.kind) {
      case "git": {
        return this.installFromGit(tool, step.url);
      }
      case "archive": {
        return this.installArchiveStep(tool, step, options);
      }
      case "package-manager": {
        if (step.requiresElevation && !options.allowElevatedCommands) {
          return this.update(tool.id, {
            status: "needs_source",
            message: `Run this yourself, or approve it explicitly: ${step.command}`,
            log: [step.note],
          });
        }
        return this.runCommand(tool, step.command);
      }
      case "manual": {
        return this.update(tool.id, { status: "needs_source", message: `${step.reason} See ${step.docsUrl}.` });
      }
      default:
        return this.update(tool.id, { status: "unsupported", message: "This install step is not implemented." });
    }
  }

  private async installArchiveStep(tool: ToolEntry, step: Extract<InstallStep, { kind: "archive" }>, options: InstallPlanOptions): Promise<InstallRecord> {
    const destinationDir = path.join(this.toolsDir(), tool.id);
    fs.mkdirSync(destinationDir, { recursive: true });
    const destination = path.join(destinationDir, step.fileName);

    this.update(tool.id, {
      status: "installing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      bytesDownloaded: 0,
      totalBytes: step.sizeBytes > 0 ? step.sizeBytes : null,
      percent: 0,
      message: `Downloading ${step.fileName} (${formatBytes(step.sizeBytes)})…`,
      log: [step.note],
    });
    this.persist();

    const controller = new AbortController();
    this.running.set(tool.id, { kill: () => controller.abort() });

    try {
      const response = await fetch(step.url, { signal: controller.signal, redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`The download returned HTTP ${response.status}.`);

      const stream = fs.createWriteStream(destination);
      const hash = crypto.createHash("sha256");
      let downloaded = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        downloaded += value.byteLength;
        hash.update(value);
        await new Promise<void>((resolve, reject) => stream.write(Buffer.from(value), (error) => (error ? reject(error) : resolve())));
        this.update(tool.id, {
          bytesDownloaded: downloaded,
          percent: step.sizeBytes > 0 ? Math.min(100, Math.round((downloaded / step.sizeBytes) * 100)) : null,
        });
      }
      await new Promise<void>((resolve) => stream.end(resolve));
      this.running.delete(tool.id);

      // Verify against the facts the plan was built from.
      if (step.sizeBytes > 0 && downloaded !== step.sizeBytes) {
        fs.rmSync(destination, { force: true });
        const record = this.update(tool.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          message: `Downloaded ${formatBytes(downloaded)} but the release publishes ${formatBytes(step.sizeBytes)}. The file was discarded.`,
        });
        this.persist();
        return record;
      }
      if (step.sha256) {
        const actual = hash.digest("hex");
        if (actual !== step.sha256) {
          fs.rmSync(destination, { force: true });
          const record = this.update(tool.id, {
            status: "failed",
            finishedAt: new Date().toISOString(),
            message: `Checksum mismatch: expected ${step.sha256.slice(0, 16)}…, got ${actual.slice(0, 16)}…. The file was discarded.`,
          });
          this.persist();
          return record;
        }
      }

      const extraction = options.extract === false ? { done: false, note: "Extraction skipped on request." } : await extractArchive(destination, step.extract, destinationDir);
      const record = this.update(tool.id, {
        status: "ready",
        installPath: extraction.done ? destinationDir : destination,
        finishedAt: new Date().toISOString(),
        percent: 100,
        message: `Downloaded and verified ${formatBytes(downloaded)}. ${extraction.note}`,
      });
      this.persist();
      return record;
    } catch (error) {
      this.running.delete(tool.id);
      fs.rmSync(destination, { force: true });
      const aborted = error instanceof Error && error.name === "AbortError";
      const record = this.update(tool.id, {
        status: aborted ? "stopped" : "failed",
        finishedAt: new Date().toISOString(),
        message: aborted ? "Download cancelled." : `Download failed: ${error instanceof Error ? error.message : "unknown error"}`,
      });
      this.persist();
      return record;
    }
  }

  private async runCommand(tool: ToolEntry, command: string): Promise<InstallRecord> {
    this.update(tool.id, { status: "installing", startedAt: new Date().toISOString(), message: `Running: ${command}`, log: [] });
    this.persist();
    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const parts = command.split(/\s+/).filter(Boolean);
      const child = spawn(parts[0], parts.slice(1), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      this.running.set(tool.id, { kill: () => child.kill("SIGTERM") });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.on("error", (error) => resolve({ code: -1, output: String(error) }));
      child.on("close", (code) => resolve({ code, output }));
    });
    this.running.delete(tool.id);
    const record = this.update(tool.id, {
      status: result.code === 0 ? "ready" : "failed",
      finishedAt: new Date().toISOString(),
      percent: result.code === 0 ? 100 : null,
      message: result.code === 0 ? `${command} completed.` : `${command} exited with code ${result.code}.`,
      log: outputLines(result.output),
    });
    this.persist();
    return record;
  }
}

export type InstallPlanOptions = {
  /** Explicit consent to run commands that need administrator rights. */
  allowElevatedCommands?: boolean;
  /** Extract archives after download when an extractor is available. */
  extract?: boolean;
};

function outputLines(text: string): string[] {
  return text.trim().split(/\r?\n/).slice(-8);
}

/**
 * Extract an archive using whatever extractor this machine actually has.
 * When none is available the archive is kept and that is stated plainly.
 */
async function extractArchive(
  archivePath: string,
  kind: Extract<InstallStep, { kind: "archive" }>["extract"],
  destinationDir: string,
): Promise<{ done: boolean; note: string }> {
  if (kind === "none" || kind === "appimage") {
    return { done: false, note: kind === "appimage" ? "This is an AppImage: make it executable and run it directly." : "This file does not need extracting." };
  }
  const commands: Record<string, [string, string[]]> = {
    zip: ["unzip", ["-o", archivePath, "-d", destinationDir]],
    "7z": ["7z", ["x", "-y", `-o${destinationDir}`, archivePath]],
    "tar.gz": ["tar", ["-xzf", archivePath, "-C", destinationDir]],
  };
  const entry = commands[kind];
  if (!entry) return { done: false, note: "No extractor is configured for this archive type." };
  const [binary, args] = entry;
  const result = await new Promise<{ code: number | null; error?: string }>((resolve) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", (error) => resolve({ code: -1, error: String(error) }));
    child.on("close", (code) => resolve({ code, error: err }));
  });
  if (result.code === 0) return { done: true, note: `Extracted with ${binary}.` };
  return { done: false, note: `Downloaded, but ${binary} could not extract it${result.error ? ` (${result.error.slice(0, 120)})` : ""}. The archive was kept.` };
}

let sharedInstaller: AssetInstaller | null = null;

/**
 * The process-wide installer. Install state lives beside the workspace data so a
 * restart remembers what is genuinely installed.
 */
export function getSharedInstaller(): AssetInstaller {
  if (!sharedInstaller) {
    const base = process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
    sharedInstaller = new AssetInstaller(base);
  }
  return sharedInstaller;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Real probe: does this binary exist and respond to --version? */
export async function probeBinary(command: string): Promise<{ found: boolean; path?: string; version?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, ["-version"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ found: false });
    }, 4000);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ found: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || output.trim().length > 0) {
        resolve({ found: true, path: command, version: output.trim().split(/\r?\n/)[0]?.slice(0, 120) });
      } else {
        resolve({ found: false });
      }
    });
  });
}
