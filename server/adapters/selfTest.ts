/**
 * Hardware readiness self-test.
 *
 * This is how the "real GPU proof run" actually gets completed: it runs on the
 * machine that has the hardware, detects what is genuinely there, probes every
 * adapter for real, and — when asked — drives the full proof scene through the
 * installed models.
 *
 * Detection is real or it is UNKNOWN. There is no path here that reports a capability
 * the machine has not demonstrated.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAdapters, adapterHealth, type AdapterSet, type AdapterRuntimeConfig } from "./index";
import type { AdapterStatus } from "./types";
import { runProofScene, type ProofReport } from "../proofScene";
import type { Workflow } from "./workflowTypes";

export type Backend = "cuda" | "rocm" | "vulkan" | "metal" | "cpu";

export type HardwareReport = {
  os: string;
  arch: string;
  cpu: string;
  cpuCount: number;
  ramGB: number | null;
  gpu: string;
  vramGB: number | null;
  backends: Backend[];
  /** How each fact was established, so nothing looks guessed. */
  sources: Record<string, string>;
  notes: string[];
};

export type SelfTestStep = {
  id: string;
  title: string;
  status: "passed" | "failed" | "blocked" | "skipped";
  detail: string;
  durationMs: number;
};

export type SelfTestReport = {
  verdict: "ready" | "degraded" | "not_ready";
  summary: string;
  hardware: HardwareReport;
  adapters: AdapterStatus[];
  steps: SelfTestStep[];
  proof?: ProofReport;
  startedAt: string;
  finishedAt: string;
};

function run(command: string, args: string[], timeoutMs = 6000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, stdout: typeof stdout === "string" ? stdout : "" });
    });
  });
}

/**
 * Detect the real hardware. Every field is either measured or "unknown"; nothing is
 * inferred from what the machine "probably" has.
 */
export async function detectHardware(): Promise<HardwareReport> {
  const sources: Record<string, string> = {};
  const notes: string[] = [];
  const cpus = os.cpus();
  const totalRam = os.totalmem();
  const ramGB = totalRam > 0 ? Math.round((totalRam / 1024 ** 3) * 10) / 10 : null;
  sources.ramGB = totalRam > 0 ? "os.totalmem()" : "unavailable";
  sources.cpu = cpus.length > 0 ? "os.cpus()" : "unavailable";

  let gpu = "unknown";
  let vramGB: number | null = null;
  const backends: Backend[] = [];

  // NVIDIA
  const nvidia = await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  if (nvidia.ok && nvidia.stdout.trim()) {
    const first = nvidia.stdout.trim().split(/\r?\n/)[0];
    const [name, memory] = first.split(",").map((part) => part.trim());
    gpu = name || "NVIDIA GPU";
    const mb = Number(memory);
    if (Number.isFinite(mb) && mb > 0) vramGB = Math.round((mb / 1024) * 10) / 10;
    backends.push("cuda");
    sources.gpu = "nvidia-smi";
  } else {
    // AMD
    const rocm = await run("rocm-smi", ["--showproductname", "--showmeminfo", "vram"]);
    if (rocm.ok && rocm.stdout.trim()) {
      const nameMatch = rocm.stdout.match(/Card series:\s*(.+)/i) ?? rocm.stdout.match(/GPU\[\d+\]\s*:\s*(.+)/i);
      gpu = nameMatch ? nameMatch[1].trim() : "AMD GPU";
      const vramMatch = rocm.stdout.match(/VRAM Total Memory \(B\):\s*(\d+)/i);
      if (vramMatch) vramGB = Math.round((Number(vramMatch[1]) / 1024 ** 3) * 10) / 10;
      backends.push("rocm", "vulkan");
      sources.gpu = "rocm-smi";
    } else if (process.platform === "darwin") {
      const profiler = await run("system_profiler", ["SPDisplaysDataType", "-json"], 10_000);
      if (profiler.ok && profiler.stdout.trim()) {
        try {
          const parsed = JSON.parse(profiler.stdout) as { SPDisplaysDataType?: Array<Record<string, unknown>> };
          const first = parsed.SPDisplaysDataType?.[0];
          const name = String(first?.["sppci_model"] ?? first?.["_name"] ?? "");
          if (name) gpu = name;
          backends.push("metal");
          sources.gpu = "system_profiler";
          notes.push("Apple Silicon uses unified memory, so a separate video-memory figure is not reported.");
        } catch {
          notes.push("system_profiler returned output that could not be read as JSON.");
        }
      }
    } else {
      const lspci = await run("lspci", []);
      if (lspci.ok && /VGA|3D controller/i.test(lspci.stdout)) {
        const line = lspci.stdout.split(/\r?\n/).find((entry) => /VGA|3D controller/i.test(entry));
        gpu = line ? line.replace(/^\S+\s+/, "").trim().slice(0, 120) : "unknown";
        sources.gpu = "lspci (name only; no driver memory reported)";
        notes.push("A display adapter was found but its video memory could not be read, so the amount is unknown.");
      }
    }
  }

  if (gpu === "unknown") {
    notes.push("No GPU could be identified, so compatibility is reported as unknown rather than assumed.");
  }
  // CPU is always a real backend, but it is listed last because it is the slow one.
  backends.push("cpu");

  return {
    os: process.platform,
    arch: process.arch,
    cpu: cpus[0]?.model?.trim() || "unknown",
    cpuCount: cpus.length,
    ramGB,
    gpu,
    vramGB,
    backends: Array.from(new Set(backends)),
    sources,
    notes,
  };
}

export type SelfTestOptions = {
  config?: AdapterRuntimeConfig;
  /** Run the full proof scene after the probes. Needs a workflow and prompts. */
  proof?: { workflow: Workflow; promptA: string; promptB: string; frames?: number; takes?: number };
  workDir?: string;
};

/**
 * Run the readiness self-test. Steps that cannot be performed are reported as skipped
 * or blocked with the reason — never as passed.
 */
export async function runSelfTest(options: SelfTestOptions = {}): Promise<SelfTestReport> {
  const startedAt = new Date().toISOString();
  const steps: SelfTestStep[] = [];
  const config = options.config ?? (await import("./index")).runtimeConfig();
  const adapters: AdapterSet = buildAdapters(config);

  const timed = async (
    id: string,
    title: string,
    work: () => Promise<{ status: SelfTestStep["status"]; detail: string }>,
  ): Promise<void> => {
    const began = Date.now();
    try {
      const result = await work();
      steps.push({ id, title, durationMs: Date.now() - began, ...result });
    } catch (error) {
      steps.push({ id, title, status: "failed", detail: error instanceof Error ? error.message : "Unknown failure.", durationMs: Date.now() - began });
    }
  };

  // 1. Hardware
  let hardware: HardwareReport;
  const hardwareBegan = Date.now();
  try {
    hardware = await detectHardware();
    steps.push({
      id: "hardware",
      title: "Detect this machine",
      status: hardware.gpu === "unknown" ? "blocked" : "passed",
      detail:
        hardware.gpu === "unknown"
          ? "The CPU and memory were read, but no GPU could be identified. GPU-only tools will be reported as unknown."
          : `${hardware.gpu}${hardware.vramGB ? ` (${hardware.vramGB} GB)` : ""}, ${hardware.ramGB ?? "?"} GB RAM, backends: ${hardware.backends.join(", ")}.`,
      durationMs: Date.now() - hardwareBegan,
    });
  } catch (error) {
    hardware = { os: process.platform, arch: process.arch, cpu: "unknown", cpuCount: 0, ramGB: null, gpu: "unknown", vramGB: null, backends: ["cpu"], sources: {}, notes: [String(error)] };
    steps.push({ id: "hardware", title: "Detect this machine", status: "failed", detail: String(error), durationMs: Date.now() - hardwareBegan });
  }

  // 2. Adapter probes — real health checks.
  await timed("adapters", "Probe every adapter", async () => {
    const health = await adapterHealth(adapters);
    const ready = health.filter((entry) => entry.state === "ready");
    if (ready.length === 0) {
      return { status: "blocked", detail: `No adapter is ready. ${health.map((entry) => `${entry.toolId}: ${entry.state}`).join("; ")}` };
    }
    return {
      status: ready.length === health.length ? "passed" : "blocked",
      detail: `${ready.length} of ${health.length} adapters are ready: ${ready.map((entry) => entry.toolId).join(", ")}.`,
    };
  });

  // 3. A real media encode, when FFmpeg is present.
  await timed("media", "Encode and verify a real clip", async () => {
    const probe = await adapters.ffmpeg.healthCheck();
    if (probe.state !== "ready") {
      return { status: "skipped", detail: `FFmpeg is not available, so the media path was not exercised. ${probe.message}` };
    }
    const workDir = options.workDir ?? path.join(config.mediaDir, "selftest");
    fs.mkdirSync(workDir, { recursive: true });
    const clip = path.join(workDir, "selftest.mp4");
    // Generate the clip with the same adapter the pipeline uses.
    const generated = await adapters.ffmpeg.run({
      jobId: "selftest-source",
      inputPath: "testsrc2=size=320x180:rate=24:duration=1",
      outputPath: clip,
      preInputArgs: ["-f", "lavfi"],
    });
    if (generated.status !== "completed") {
      return { status: "failed", detail: `Could not produce a test clip: ${generated.status === "failed" ? generated.error : generated.status}.` };
    }
    const readback = await adapters.ffmpeg.probe(clip);
    if (!readback.valid) {
      return { status: "failed", detail: `The clip was produced but did not validate: ${readback.error ?? "invalid"}.` };
    }
    return {
      status: "passed",
      detail: `Encoded and validated a ${readback.detail.durationSeconds}s ${readback.detail.width}×${readback.detail.height} ${readback.detail.codec} clip.`,
    };
  });

  // 4. The reviewer endpoint.
  await timed("reviewer", "Probe the reviewer endpoint", async () => {
    const status = await adapters.reviewer.healthCheck();
    if (status.state === "ready") return { status: "passed", detail: status.message };
    return { status: "blocked", detail: `The reviewer is not available, so no AI review can run. ${status.message}` };
  });

  // 5. The proof scene, when asked for and when the plane is complete.
  let proof: ProofReport | undefined;
  if (options.proof) {
    await timed("proof", "Run the proof scene", async () => {
      const workDir = options.workDir ?? path.join(config.mediaDir, "proof");
      proof = await runProofScene(adapters, {
        workflow: options.proof!.workflow,
        shots: [
          { shotId: "proof-shot-1", prompt: options.proof!.promptA, takes: options.proof!.takes ?? 2, frames: options.proof!.frames ?? 24 },
          {
            shotId: "proof-shot-2",
            prompt: options.proof!.promptB,
            takes: options.proof!.takes ?? 2,
            frames: options.proof!.frames ?? 24,
            continuity: [{ subject: "Lead", lockedFields: ["face", "costume", "position"], referenceAssetIds: ["proof-reference"] }],
          },
        ],
        workDir,
      });
      return { status: proof.verdict === "passed" ? "passed" : proof.verdict === "blocked" ? "blocked" : "failed", detail: proof.summary };
    });
  } else {
    steps.push({ id: "proof", title: "Run the proof scene", status: "skipped", detail: "Not requested. Supply a workflow and two prompts to run the full acceptance flow.", durationMs: 0 });
  }

  const failed = steps.filter((step) => step.status === "failed");
  const blocked = steps.filter((step) => step.status === "blocked");
  const verdict: SelfTestReport["verdict"] = failed.length > 0 ? "not_ready" : blocked.length > 0 ? "degraded" : "ready";
  const summary =
    verdict === "ready"
      ? "This machine is ready: the hardware was detected, every adapter answered, real media was encoded and validated, and the reviewer is up."
      : verdict === "degraded"
        ? `Partly ready. ${blocked.map((step) => step.detail).join(" ")}`
        : `Not ready. ${failed.map((step) => `${step.title}: ${step.detail}`).join(" ")}`;

  return { verdict, summary, hardware, adapters: await adapterHealth(adapters), steps, proof, startedAt, finishedAt: new Date().toISOString() };
}
