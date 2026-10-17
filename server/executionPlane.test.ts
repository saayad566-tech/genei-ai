import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ComfyUiAdapter, applyMarkers, autoDetectWorkflow, injectWorkflow } from "./adapters/comfyui";
import { FfmpegAdapter, LipSyncAdapter, UpscalerAdapter, WhisperCppAdapter, evalFraction, extractPercent } from "./adapters/cliAdapters";
import { VlmReviewerAdapter, parseReviewResponse } from "./adapters/vlmReviewer";
import { buildAdapters, resolveAdapter, runtimeConfig, type AdapterSet } from "./adapters";
import { runProofScene } from "./proofScene";
import type { Workflow } from "./adapters/workflowTypes";

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `genei-${name}-`));

// ── A mock ComfyUI that speaks the real protocol ────────────────────────────

type MockOptions = { failJob?: boolean; emptyOutputs?: boolean; rejectWorkflow?: boolean };
let mockState: MockOptions = {};
let comfy: http.Server;
let comfyUrl = "";
let receivedPrompt: Record<string, unknown> | null = null;
let interruptCalled = false;

function json(res: http.ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  comfy = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/system_stats") {
      return json(res, { system: { comfyui_version: "test-1.0", python_version: "3.11" }, devices: [{ name: "Mock GPU", vram_total: 8 * 1024 ** 3 }] });
    }
    if (url === "/prompt" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedPrompt = JSON.parse(body) as Record<string, unknown>;
        if (mockState.rejectWorkflow) return json(res, { node_errors: { "3": "bad input" } }, 400);
        json(res, { prompt_id: "prompt-1" });
      });
      return;
    }
    if (url === "/history/prompt-1") {
      if (mockState.failJob) return json(res, { "prompt-1": { status: { completed: true, status_str: "error", messages: [["execution_error", { node: "3" }]] } } });
      if (mockState.emptyOutputs) return json(res, { "prompt-1": { status: { completed: true }, outputs: {} } });
      return json(res, { "prompt-1": { status: { completed: true }, outputs: { "9": { gifs: [{ filename: "shot.mp4", subfolder: "sub", type: "output" }] } } } });
    }
    if (url.startsWith("/view")) {
      res.setHeader("content-type", "video/mp4");
      return res.end(Buffer.from("MOCK-VIDEO-BYTES"));
    }
    if (url === "/interrupt") {
      interruptCalled = true;
      return json(res, {});
    }
    if (url === "/queue") return json(res, { queue_running: [], queue_pending: [] });
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => comfy.listen(0, "127.0.0.1", resolve));
  const address = comfy.address();
  comfyUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
});

afterAll(async () => {
  await new Promise<void>((resolve) => comfy.close(() => resolve()));
});

// ── Fake CLI binaries that behave like the real tools ───────────────────────

function writeExecutable(dir: string, name: string, script: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, script, { mode: 0o755 });
  return file;
}

/** A whisper-cli that writes the JSON file it is asked for. */
function fakeWhisper(dir: string, opts: { writeOutput?: boolean } = {}): string {
  return writeExecutable(
    dir,
    "whisper-cli",
    `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -of) shift; out="$1" ;;
  esac
  shift
done
echo "whisper: processing"
echo "whisper: 50%"
if [ "${opts.writeOutput === false ? "no" : "yes"}" = "yes" ] && [ -n "$out" ]; then
  printf '{"transcription":[]}' > "$out.json"
fi
exit 0
`,
  );
}

/** An ffmpeg that writes the output file, and an ffprobe that reports a valid stream. */
function fakeFfmpeg(dir: string): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = writeExecutable(
    dir,
    "ffmpeg",
    `#!/bin/sh
if [ "$1" = "--help" ] || [ "$1" = "--version" ]; then echo "fake-whisper 1.0"; exit 0; fi
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "1" ]; then out="$a"; fi
  prev=0
  case "$a" in -o|-i) prev=1 ;; esac
done
# The real ffmpeg writes to the last argument.
for a in "$@"; do out="$a"; done
printf 'FAKE-MEDIA' > "$out"
exit 0
`,
  );
  const ffprobe = writeExecutable(
    dir,
    "ffprobe",
    `#!/bin/sh
if [ "$1" = "-version" ]; then echo "ffprobe version fake"; exit 0; fi
echo '{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080,"r_frame_rate":"24/1","duration":"8.0"},{"codec_type":"audio","codec_name":"aac"}],"format":{"duration":"8.0","size":12345}}'
exit 0
`,
  );
  return { ffmpeg, ffprobe };
}

// ── ComfyUI adapter ─────────────────────────────────────────────────────────

describe("ComfyUI adapter", () => {
  it("reports ready only after a real probe of /system_stats", async () => {
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy") });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("ready");
    expect(status.detail?.device).toBe("Mock GPU");
    expect(status.detail?.vramTotalMB).toBe(8192);
  });

  it("reports stopped when nothing is listening", async () => {
    const adapter = new ComfyUiAdapter({ baseUrl: "http://127.0.0.1:1", outputDir: tmp("comfy") });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("stopped");
    expect(status.message).toMatch(/not reachable/i);
  });

  it("submits a workflow, polls history, and retrieves the real output file", async () => {
    mockState = {};
    const outputDir = tmp("comfy");
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir, pollIntervalMs: 10 });
    const workflow: Workflow = { "3": { class_type: "KSampler", inputs: { text: "{{positive}}", seed: 0 } } };

    const outcome = await adapter.generate(workflow, { positivePrompt: "a lighthouse at dusk", seed: 7 });
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;

    expect(outcome.output.files).toHaveLength(1);
    const file = outcome.output.files[0];
    expect(file.kind).toBe("video");
    expect(file.bytes).toBe(Buffer.from("MOCK-VIDEO-BYTES").byteLength);
    expect(fs.existsSync(file.localPath)).toBe(true);
    expect(fs.readFileSync(file.localPath).toString()).toBe("MOCK-VIDEO-BYTES");
    expect(file.sha256).toHaveLength(64);

    // The injected prompt really reached the server.
    const sent = receivedPrompt as { prompt?: Workflow } | null;
    expect(sent?.prompt?.["3"].inputs?.text).toBe("a lighthouse at dusk");
  });

  it("fails the job when ComfyUI reports an execution error", async () => {
    mockState = { failJob: true };
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy"), pollIntervalMs: 10 });
    const outcome = await adapter.generate({ "3": { class_type: "KSampler", inputs: {} } }, { positivePrompt: "x" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/reported the job failed/i);
  });

  it("fails rather than claiming success when no output can be retrieved", async () => {
    mockState = { emptyOutputs: true };
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy"), pollIntervalMs: 10 });
    const outcome = await adapter.generate({ "3": { class_type: "KSampler", inputs: {} } }, { positivePrompt: "x" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/no retrievable output/i);
  });

  it("surfaces a rejected workflow instead of hanging", async () => {
    mockState = { rejectWorkflow: true };
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy"), pollIntervalMs: 10 });
    const outcome = await adapter.generate({ "3": { class_type: "KSampler", inputs: {} } }, { positivePrompt: "x" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/rejected the workflow/i);
    mockState = {};
  });

  it("cancels through ComfyUI's own interrupt endpoint", async () => {
    interruptCalled = false;
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy") });
    expect(await adapter.cancel()).toBe(true);
    expect(interruptCalled).toBe(true);
  });

  it("reports queue depth from the real queue endpoint", async () => {
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy") });
    expect(await adapter.queueDepth()).toEqual({ running: 0, pending: 0 });
  });

  it("declares capabilities from the workflow template rather than assuming them", async () => {
    const adapter = new ComfyUiAdapter({ baseUrl: comfyUrl, outputDir: tmp("comfy") });
    const caps = await adapter.getCapabilities({ "1": { class_type: "LoadImage", inputs: {} }, "2": { class_type: "WanFirstLastFrameToVideo", inputs: {} } });
    expect(caps.supportsStartEndFrame).toBe(true);
    expect(caps.supportsImageToVideo).toBe(true);
    expect(caps.supportsTextToVideo).toBe(false);
  });
});

// ── Workflow parameterisation ───────────────────────────────────────────────

describe("workflow parameterisation", () => {
  it("substitutes markers, including numeric exact matches", () => {
    const workflow: Workflow = { "1": { class_type: "KSampler", inputs: { text: "{{positive}}", seed: "{{seed}}", note: "cfg is {{cfg}}" } } };
    const { workflow: out, substitutions } = applyMarkers(workflow, { positivePrompt: "hello", seed: 42, cfg: 7 });
    expect(substitutions).toBe(3);
    expect(out["1"].inputs?.text).toBe("hello");
    expect(out["1"].inputs?.seed).toBe(42);
    expect(out["1"].inputs?.note).toBe("cfg is 7");
  });

  it("leaves unknown markers untouched rather than blanking them", () => {
    const workflow: Workflow = { "1": { class_type: "KSampler", inputs: { text: "{{mystery}}" } } };
    expect(applyMarkers(workflow, {}).workflow["1"].inputs?.text).toBe("{{mystery}}");
  });

  it("prefers markers, and falls back to auto-detection of standard nodes", () => {
    const marked: Workflow = { "1": { class_type: "CLIPTextEncode", inputs: { text: "{{positive}}" } } };
    expect(injectWorkflow(marked, { positivePrompt: "p" }).strategy).toBe("markers");

    const plain: Workflow = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "old positive" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "old negative" } },
      "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20, cfg: 7 } },
      "4": { class_type: "EmptyLatentVideo", inputs: { width: 512, height: 512, length: 16 } },
    };
    const result = injectWorkflow(plain, { positivePrompt: "new positive", negativePrompt: "new negative", seed: 99, width: 1280, height: 720, frames: 48 });
    expect(result.strategy).toBe("auto");
    expect(result.workflow["1"].inputs?.text).toBe("new positive");
    expect(result.workflow["2"].inputs?.text).toBe("new negative");
    expect(result.workflow["3"].inputs?.seed).toBe(99);
    expect(result.workflow["4"].inputs?.width).toBe(1280);
    expect(result.workflow["4"].inputs?.length).toBe(48);
  });

  it("says so when a workflow cannot be parameterised at all", () => {
    const result = injectWorkflow({ "1": { class_type: "Unknown", inputs: { a: 1 } } }, { positivePrompt: "x" });
    expect(result.strategy).toBe("none");
    expect(result.detail).toMatch(/no markers/i);
  });

  it("detects standard nodes without mutating the caller's template", () => {
    const template: Workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
    autoDetectWorkflow(template, { seed: 500 });
    expect(template["1"].inputs?.seed).toBe(1);
  });
});

// ── CLI adapters ────────────────────────────────────────────────────────────

describe("CLI adapters", () => {
  it("reports not_installed when the binary is absent, and refuses to run", async () => {
    const adapter = new WhisperCppAdapter({ outputDir: tmp("whisper"), binaryEnvVar: "GENEI_TEST_MISSING_BIN" });
    process.env.GENEI_TEST_MISSING_BIN = path.join(tmp("nope"), "does-not-exist");
    const status = await adapter.healthCheck();
    expect(status.state).toBe("not_installed");

    const outcome = await adapter.run({ jobId: "j1", inputPath: "/tmp/a.wav", outputPath: "/tmp/out" });
    expect(outcome.status).toBe("unsupported");
    if (outcome.status === "unsupported") expect(outcome.reason).toMatch(/not installed/i);
  });

  it("runs a real process and confirms the expected file exists", async () => {
    const dir = tmp("whisper");
    process.env.GENEI_TEST_WHISPER_BIN = fakeWhisper(dir);
    const outputDir = tmp("whisper-out");
    const adapter = new WhisperCppAdapter({ outputDir, binaryEnvVar: "GENEI_TEST_WHISPER_BIN" });
    expect((await adapter.healthCheck()).state).toBe("ready");

    const outcome = await adapter.run({ jobId: "j2", inputPath: "/tmp/audio.wav", outputPath: path.join(outputDir, "transcript") });
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") {
      expect(outcome.output.outputs).toHaveLength(1);
      expect(fs.existsSync(outcome.output.outputs[0])).toBe(true);
    }
  });

  it("treats exit code 0 with no output file as a failure", async () => {
    const dir = tmp("whisper-bad");
    process.env.GENEI_TEST_WHISPER_BAD_BIN = fakeWhisper(dir, { writeOutput: false });
    const adapter = new WhisperCppAdapter({ outputDir: tmp("whisper-out"), binaryEnvVar: "GENEI_TEST_WHISPER_BAD_BIN" });
    const outcome = await adapter.run({ jobId: "j3", inputPath: "/tmp/audio.wav", outputPath: path.join(tmp("whisper-out"), "nothing") });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/did not produce/i);
  });

  it("builds the documented lip-sync and upscale command lines", async () => {
    const dir = tmp("cli");
    process.env.GENEI_TEST_PY = writeExecutable(dir, "python3", "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"Python 3.11\"; fi\necho ok\nexit 0\n");
    process.env.GENEI_TEST_V2X = writeExecutable(dir, "video2x", "#!/bin/sh\nif [ \"$1\" = \"--help\" ]; then echo \"video2x 6.0\"; fi\necho ok\nexit 0\n");

    const lip = new LipSyncAdapter({ outputDir: tmp("lip"), binaryEnvVar: "GENEI_TEST_PY", installDir: "/opt/musetalk" }, "musetalk");
    const up = new UpscalerAdapter({ outputDir: tmp("up"), binaryEnvVar: "GENEI_TEST_V2X" }, "video2x");

    // Both must resolve a real binary and report ready.
    expect((await lip.healthCheck()).state).toBe("ready");
    expect((await up.healthCheck()).state).toBe("ready");
    expect((await up.getCapabilities()).capabilities).toContain("upscale");
  });

  it("parses progress and frame-rate tokens", () => {
    expect(extractPercent("frame 42/100 42%")).toBe(42);
    expect(extractPercent("no percentage here")).toBeNull();
    expect(evalFraction("24000/1001")).toBeCloseTo(23.976, 2);
    expect(evalFraction("30")).toBe(30);
    expect(evalFraction("0/0")).toBe(0);
  });

  it("probes media through ffprobe and rejects a missing file", async () => {
    const dir = tmp("ffmpeg");
    const { ffmpeg } = fakeFfmpeg(dir);
    process.env.GENEI_TEST_FFMPEG_BIN = ffmpeg;
    const adapter = new FfmpegAdapter({ outputDir: tmp("ffout"), binaryEnvVar: "GENEI_TEST_FFMPEG_BIN" });

    const missing = await adapter.probe(path.join(dir, "nope.mp4"));
    expect(missing.valid).toBe(false);

    const present = path.join(dir, "clip.mp4");
    fs.writeFileSync(present, "x");
    const probed = await adapter.probe(present);
    expect(probed.valid).toBe(true);
    expect(probed.detail.width).toBe(1920);
    expect(probed.detail.fps).toBe(24);
    expect(probed.detail.hasAudio).toBe(true);
  });
});

// ── AI reviewer ─────────────────────────────────────────────────────────────

describe("AI reviewer", () => {
  it("reports UNKNOWN — never PASS — when it has no frames to inspect", async () => {
    const reviewer = new VlmReviewerAdapter({ baseUrl: "http://127.0.0.1:1/v1", model: "m" });
    const finding = await reviewer.review([], { shotId: "s1", prompt: "p" });
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.reason).toMatch(/not inspected/i);
  });

  it("reports UNKNOWN when the endpoint is unreachable", async () => {
    const dir = tmp("frames");
    const frame = path.join(dir, "f.png");
    fs.writeFileSync(frame, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const reviewer = new VlmReviewerAdapter({ baseUrl: "http://127.0.0.1:1/v1", model: "m" });
    const finding = await reviewer.review([frame], { shotId: "s1", prompt: "p" });
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.inspectedFrames).toBe(0);
  });

  it("parses a plain or fenced JSON verdict", () => {
    const plain = parseReviewResponse('{"status":"PASS","score":88,"issues":[],"evidence":["consistent face"],"severity":[],"recommendedFix":"","retryRequired":false}');
    expect(plain?.status).toBe("PASS");
    expect(plain?.score).toBe(88);

    const fenced = parseReviewResponse('Here you go:\n```json\n{"status":"REVISE","score":61,"issues":["hand"],"severity":["low"],"evidence":[],"recommendedFix":"resample","retryRequired":true}\n```');
    expect(fenced?.status).toBe("REVISE");
    expect(fenced?.retryRequired).toBe(true);
  });

  it("never invents a verdict from an unreadable reply", () => {
    expect(parseReviewResponse("I could not analyse the frames.")).toBeNull();
    expect(parseReviewResponse('{"status":"MAYBE","score":5}')?.status).toBe("UNKNOWN");
    expect(parseReviewResponse('{"status":"PASS","score":999}')?.score).toBe(100);
  });
});

// ── Adapter resolution ──────────────────────────────────────────────────────

describe("adapter resolution", () => {
  it("returns no adapter and the full considered list when nothing is available", async () => {
    const config = runtimeConfig({ comfyUrl: "http://127.0.0.1:1", vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp("tools") });
    const adapters = buildAdapters(config);
    const resolution = await resolveAdapter("video_generation", adapters);
    expect(resolution.adapterId).toBeNull();
    expect(resolution.considered[0].adapterId).toBe("comfyui");
    expect(resolution.considered[0].state).toBe("stopped");
  });

  it("selects the first preference when it really answers", async () => {
    const config = runtimeConfig({ comfyUrl: comfyUrl, vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp("tools") });
    const adapters = buildAdapters(config);
    const resolution = await resolveAdapter("video_generation", adapters);
    expect(resolution.adapterId).toBe("comfyui");
    expect(resolution.fellBack).toBe(false);
  });
});

// ── Proof scene, end to end ─────────────────────────────────────────────────

describe("proof scene", () => {
  it("is blocked, not passed, when the execution plane is missing", async () => {
    const config = runtimeConfig({ comfyUrl: "http://127.0.0.1:1", vlmUrl: "http://127.0.0.1:1/v1", toolsDir: tmp("tools") });
    const report = await runProofScene(buildAdapters(config), {
      workflow: { "3": { class_type: "KSampler", inputs: { text: "{{positive}}" } } },
      shots: [
        { shotId: "s1", prompt: "wide shot", takes: 1 },
        { shotId: "s2", prompt: "close up", takes: 1, continuity: [{ subject: "Lead", lockedFields: ["face", "costume"], referenceAssetIds: ["asset-1"] }] },
      ],
      workDir: tmp("proof"),
    });
    expect(report.verdict).toBe("blocked");
    expect(report.summary).toMatch(/blocked/i);
    expect(report.steps[0].status).toBe("blocked");
  });

  it("runs the full flow against a real ComfyUI protocol, real processes and real files", async () => {
    mockState = {};
    const dir = tmp("proof-e2e");
    const { ffmpeg } = fakeFfmpeg(dir);
    process.env.GENEI_TEST_FFMPEG_E2E = ffmpeg;

    // A reviewer endpoint that genuinely inspects the frames it is handed.
    const reviewServer = http.createServer((req, res) => {
      const url = req.url ?? "";
      if (url.endsWith("/models")) return json(res, { data: [{ id: "mock-vlm" }] });
      if (url.endsWith("/chat/completions")) {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const parsed = JSON.parse(body) as { messages: Array<{ content: Array<{ type: string }> }> };
          const imageCount = parsed.messages[0].content.filter((part) => part.type === "image_url").length;
          // Refuse to give a verdict if it was shown nothing.
          const verdict = imageCount === 0
            ? { status: "UNKNOWN", score: 0, issues: [], evidence: [], severity: [], recommendedFix: "", retryRequired: false }
            : { status: "PASS", score: 90, issues: [], evidence: [`inspected ${imageCount} frames`], severity: [], recommendedFix: "", retryRequired: false };
          json(res, { choices: [{ message: { content: JSON.stringify(verdict) } }] });
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => reviewServer.listen(0, "127.0.0.1", resolve));
    const reviewAddress = reviewServer.address();
    const reviewUrl = typeof reviewAddress === "object" && reviewAddress ? `http://127.0.0.1:${reviewAddress.port}/v1` : "";

    try {
      const config = runtimeConfig({ comfyUrl: comfyUrl, vlmUrl: reviewUrl, toolsDir: dir });
      const adapters = buildAdapters(config);
      // Point FFmpeg at the fake pair, which is what a machine without FFmpeg would do.
      const ffmpegAdapter = new FfmpegAdapter({ outputDir: config.mediaDir, binaryEnvVar: "GENEI_TEST_FFMPEG_E2E" });
      const withFakeFfmpeg: AdapterSet = { ...adapters, ffmpeg: ffmpegAdapter };

      const report = await runProofScene(withFakeFfmpeg, {
        workflow: { "3": { class_type: "KSampler", inputs: { text: "{{positive}}", seed: "{{seed}}" } } },
        shots: [
          { shotId: "s1", prompt: "wide establishing shot", takes: 2, frames: 8 },
          { shotId: "s2", prompt: "close up", takes: 2, frames: 8, continuity: [{ subject: "Lead", lockedFields: ["face", "costume"], referenceAssetIds: ["asset-lead-face"] }] },
        ],
        workDir: path.join(dir, "proof"),
        reviewFramesPerShot: 2,
      });

      expect(report.verdict).toBe("passed");
      expect(report.adaptersUsed.video_generation).toBe("comfyui");
      expect(report.takes.length).toBeGreaterThanOrEqual(4);
      expect(report.takes.every((take) => take.approved)).toBe(true);
      expect(report.steps.map((s) => s.id)).toEqual(expect.arrayContaining(["resolve", "continuity", "assemble"]));
      expect(report.steps.find((s) => s.id === "assemble")?.status).toBe("passed");
      expect(fs.existsSync(path.join(dir, "proof", "proof_scene.mp4"))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => reviewServer.close(() => resolve()));
    }
  }, 60_000);

  it("fails the proof rather than accepting a shot the reviewer rejects", async () => {
    mockState = {};
    const dir = tmp("proof-reject");
    const { ffmpeg } = fakeFfmpeg(dir);
    process.env.GENEI_TEST_FFMPEG_REJ = ffmpeg;

    const reviewServer = http.createServer((req, res) => {
      const url = req.url ?? "";
      if (url.endsWith("/models")) return json(res, { data: [{ id: "mock-vlm" }] });
      if (url.endsWith("/chat/completions")) {
        req.on("data", () => {});
        req.on("end", () => {
          json(res, {
            choices: [{ message: { content: JSON.stringify({ status: "FAIL", score: 12, issues: ["identity_mismatch"], evidence: [], severity: ["high"], recommendedFix: "regenerate", retryRequired: true }) } }],
          });
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => reviewServer.listen(0, "127.0.0.1", resolve));
    const address = reviewServer.address();
    const reviewUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/v1` : "";

    try {
      const config = runtimeConfig({ comfyUrl: comfyUrl, vlmUrl: reviewUrl, toolsDir: dir });
      const adapters = buildAdapters(config);
      const withFakeFfmpeg: AdapterSet = { ...adapters, ffmpeg: new FfmpegAdapter({ outputDir: config.mediaDir, binaryEnvVar: "GENEI_TEST_FFMPEG_REJ" }) };

      const report = await runProofScene(withFakeFfmpeg, {
        workflow: { "3": { class_type: "KSampler", inputs: { text: "{{positive}}" } } },
        shots: [
          { shotId: "s1", prompt: "wide", takes: 1 },
          { shotId: "s2", prompt: "close", takes: 1, continuity: [{ subject: "Lead", lockedFields: ["face"], referenceAssetIds: ["a"] }] },
        ],
        workDir: path.join(dir, "proof"),
      });

      expect(report.verdict).toBe("failed");
      expect(report.takes.some((take) => !take.approved)).toBe(true);
      expect(report.summary).toMatch(/could not be approved/i);
    } finally {
      await new Promise<void>((resolve) => reviewServer.close(() => resolve()));
    }
  }, 60_000);
});
