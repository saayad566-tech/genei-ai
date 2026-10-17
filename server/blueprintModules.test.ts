import { describe, expect, it } from "vitest";
import { ResourceAwareQueue, budgetFromHardware, QueueCancelledError } from "./jobQueue";
import {
  BASE_NEGATIVE_PROMPT,
  buildGuardrailEnvelope,
  isApprovable,
  isBlocked,
  DEFAULT_SAFETY_PARAMETERS,
} from "./directorGuardrails";
import { fetchPageForContext, groundingBlock, htmlToText, isFetchableUrl, searchForContext } from "./browsingAdapter";
import { checkCapabilities, requestedMode, validateFrameTimeline, type FrameVideoRequest, type GeneratorCapabilities } from "../shared/frameVideo";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Resource-aware queue ────────────────────────────────────────────────────

describe("resource-aware job queue", () => {
  it("runs only one heavy job at a time even when several are submitted at once", async () => {
    const queue = new ResourceAwareQueue({ ramBudgetMB: 8192, vramBudgetMB: 8192, maxConcurrentHeavyJobs: 1, highWaterMarkRatio: 0.9 });
    let concurrent = 0;
    let peak = 0;
    const order: string[] = [];

    const job = (id: string) =>
      queue.enqueue({ id, label: id, weight: "heavy" as const, estimatedPeakMB: 1000 }, async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        order.push(id);
        await sleep(15);
        concurrent -= 1;
        return id;
      });

    const results = await Promise.all([job("a"), job("b"), job("c")]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(peak).toBe(1);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("defers a heavy job that cannot fit in the remaining budget instead of starting it", async () => {
    const queue = new ResourceAwareQueue({ ramBudgetMB: 4096, vramBudgetMB: 2048, maxConcurrentHeavyJobs: 4, highWaterMarkRatio: 0.9 });
    const started: string[] = [];

    const blocking = queue.enqueue({ id: "blocker", label: "blocker", weight: "heavy", estimatedPeakMB: 2000 }, async () => {
      started.push("blocker");
      await sleep(30);
      return "blocker";
    });
    const oversized = queue.enqueue({ id: "oversized", label: "oversized", weight: "heavy", estimatedPeakMB: 9000 }, async () => {
      started.push("oversized");
      return "oversized";
    });

    await sleep(10);
    // The oversized job must still be waiting: admitting it would exceed the budget.
    expect(queue.snapshot().queued.map((job) => job.id)).toContain("oversized");
    expect(started).toEqual(["blocker"]);

    await blocking;
    expect(queue.snapshot().queued.map((job) => job.id)).toContain("oversized");
    queue.cancel("oversized");
    await expect(oversized).rejects.toBeInstanceOf(QueueCancelledError);
  });

  it("cancels a queued job and reports real counters", async () => {
    const queue = new ResourceAwareQueue({ ramBudgetMB: 1024, vramBudgetMB: 1024, maxConcurrentHeavyJobs: 1, highWaterMarkRatio: 0.9 });
    const first = queue.enqueue({ id: "one", label: "one", weight: "heavy", estimatedPeakMB: 512 }, () => sleep(25).then(() => "one"));
    const second = queue.enqueue({ id: "two", label: "two", weight: "heavy", estimatedPeakMB: 512 }, () => sleep(5).then(() => "two"));

    expect(queue.cancel("two")).toBe(true);
    await expect(second).rejects.toBeInstanceOf(QueueCancelledError);
    expect(await first).toBe("one");

    const snapshot = queue.snapshot();
    expect(snapshot.cancelled).toBe(1);
    expect(snapshot.completed).toBe(1);
    expect(snapshot.running).toHaveLength(0);
  });

  it("pauses admission under memory pressure and resumes when it clears", async () => {
    const queue = new ResourceAwareQueue({ ramBudgetMB: 4096, vramBudgetMB: 0, maxConcurrentHeavyJobs: 1, highWaterMarkRatio: 0.9 });
    queue.reportPressure({ freeRamMB: 50 });
    expect(queue.snapshot().paused).toBe(true);
    expect(queue.snapshot().pauseReason).toMatch(/memory is free/i);

    const pending = queue.enqueue({ id: "later", label: "later", weight: "heavy", estimatedPeakMB: 100 }, () => Promise.resolve("done"));
    await sleep(5);
    expect(queue.snapshot().running).toHaveLength(0);

    queue.reportPressure({ freeRamMB: 3000 });
    expect(queue.snapshot().paused).toBe(false);
    expect(await pending).toBe("done");
  });

  it("rejects a duplicate job id rather than silently queueing twice", async () => {
    const queue = new ResourceAwareQueue();
    const first = queue.enqueue({ id: "dup", label: "dup", weight: "light", estimatedPeakMB: 0 }, () => sleep(20).then(() => "ok"));
    await expect(queue.enqueue({ id: "dup", label: "dup", weight: "light", estimatedPeakMB: 0 }, () => Promise.resolve("no"))).rejects.toThrow(/already queued or running/);
    await first;
  });

  it("derives a conservative budget from real hardware and never exceeds 60% of RAM", () => {
    const budget = budgetFromHardware({ ramGB: 16, vramGB: 8 });
    expect(budget.ramBudgetMB).toBe(Math.round(16 * 1024 * 0.6));
    expect(budget.vramBudgetMB).toBe(8192);
    expect(budget.maxConcurrentHeavyJobs).toBe(1);

    const unknown = budgetFromHardware(null);
    expect(unknown.ramBudgetMB).toBe(4096);
    expect(unknown.vramBudgetMB).toBe(0);
  });
});

// ── Guardrails ──────────────────────────────────────────────────────────────

describe("director guardrails", () => {
  it("always carries the base negative prompt plus the shot exclusions", () => {
    const envelope = buildGuardrailEnvelope({
      shotId: "shot-1",
      positivePrompt: "a director walks onto a rain-soaked street at night",
      shotNegativePrompt: ["umbrella", "crowd"],
    });
    expect(envelope.negativePrompt).toContain("distorted face");
    expect(envelope.negativePrompt).toContain("identity drift");
    expect(envelope.negativePrompt).toContain("flicker");
    expect(envelope.negativePrompt).toContain("umbrella");
    expect(envelope.negativePrompt).toContain("crowd");
    // Every base exclusion survives; a shot cannot drop quality control.
    for (const term of BASE_NEGATIVE_PROMPT) expect(envelope.negativePrompt).toContain(term);
  });

  it("deduplicates exclusions case-insensitively", () => {
    const envelope = buildGuardrailEnvelope({ shotId: "s", positivePrompt: "x", shotNegativePrompt: ["Flicker", "flicker", "blurry"] });
    const occurrences = envelope.negativePrompt.toLowerCase().split("flicker").length - 1;
    expect(occurrences).toBe(1);
  });

  it("warns when continuity cannot actually be enforced", () => {
    const envelope = buildGuardrailEnvelope({
      shotId: "s",
      positivePrompt: "x",
      continuity: [{ subject: "Lead", lockedFields: [], referenceAssetIds: [] }],
    });
    expect(envelope.warnings.some((warning) => /locks no fields/i.test(warning))).toBe(true);
    expect(envelope.warnings.some((warning) => /no reference asset/i.test(warning))).toBe(true);
  });

  it("warns when a shot has no positive prompt rather than improvising one", () => {
    const envelope = buildGuardrailEnvelope({ shotId: "s", positivePrompt: "   " });
    expect(envelope.warnings.some((warning) => /no positive prompt/i.test(warning))).toBe(true);
  });

  it("refuses to approve a take on UNKNOWN, a low score, or a blocking issue", () => {
    expect(isApprovable({ status: "UNKNOWN", score: 99 }, { valid: true }).approved).toBe(false);
    expect(isApprovable({ status: "PASS", score: 40 }, { valid: true }).approved).toBe(false);
    expect(isApprovable({ status: "PASS", score: 90 }, { valid: false }).approved).toBe(false);
    const blocking = isApprovable({ status: "PASS", score: 95, issues: ["identity_mismatch"] }, { valid: true });
    expect(blocking.approved).toBe(false);
    expect(blocking.reasons.join(" ")).toMatch(/identity_mismatch/);

    expect(isApprovable({ status: "PASS", score: 85, issues: [] }, { valid: true }).approved).toBe(true);
  });

  it("blocks the categories it declares blocked", () => {
    expect(isBlocked(["minor_depiction"])).toBe(true);
    expect(isBlocked(["graphic_violence"], { ...DEFAULT_SAFETY_PARAMETERS, blocked: [] })).toBe(false);
  });
});

// ── Browsing adapter ────────────────────────────────────────────────────────

describe("browsing adapter", () => {
  it("refuses loopback and private addresses", () => {
    expect(isFetchableUrl("http://127.0.0.1:8080/x").ok).toBe(false);
    expect(isFetchableUrl("http://192.168.1.5/").ok).toBe(false);
    expect(isFetchableUrl("http://localhost/").ok).toBe(false);
    expect(isFetchableUrl("file:///etc/passwd").ok).toBe(false);
    expect(isFetchableUrl("https://example.com/docs").ok).toBe(true);
  });

  it("extracts readable text and drops script and style content", () => {
    const text = htmlToText("<html><head><title>T</title><style>.a{color:red}</style></head><body><script>evil()</script><h1>Hello</h1><p>World &amp; more</p></body></html>");
    expect(text).toContain("Hello");
    expect(text).toContain("World & more");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("color:red");
  });

  it("reports search as unsupported when no endpoint is configured instead of inventing results", async () => {
    const previous = process.env.GENEI_SEARCH_ENDPOINT;
    delete process.env.GENEI_SEARCH_ENDPOINT;
    const result = await searchForContext("latest camera firmware");
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.reason).toMatch(/GENEI_SEARCH_ENDPOINT/);
    if (previous !== undefined) process.env.GENEI_SEARCH_ENDPOINT = previous;
  });

  it("tells the model not to present remembered information as current when grounding fails", () => {
    const block = groundingBlock({ status: "unsupported", reason: "No search endpoint is configured." });
    expect(block).toMatch(/Do not present remembered or assumed information as current/);
  });

  it("returns a real error state for a host that cannot resolve", async () => {
    const result = await fetchPageForContext("https://this-host-does-not-exist.invalid/page", { timeoutMs: 4000 });
    expect(result.status).toBe("error");
  }, 20_000);
});

// ── Frame-to-video contract ─────────────────────────────────────────────────

describe("frame-to-video contract", () => {
  const frame = (frameId: string, frameType: "START" | "END" | "KEYFRAME", timestamp: number) => ({
    frameId,
    frameType,
    timestamp,
    assetId: `asset-${frameId}`,
    source: "generated",
    checksum: "abc",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
  });

  const base: FrameVideoRequest = {
    shotId: "s1",
    sceneId: "sc1",
    sequenceId: "sq1",
    keyframes: [],
    prompt: "p",
    negativePrompt: "n",
    duration: 10,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    cameraMovement: "dolly in",
    subjectMovement: "walks",
    transitionStyle: "cut",
    characterReferences: [],
    locationReferences: [],
    propReferences: [],
    seed: 1,
    model: "",
    workflow: "",
    reviewCriteria: [],
    continuityRequirements: [],
  };

  const caps = (overrides: Partial<GeneratorCapabilities> = {}): GeneratorCapabilities => ({
    supportsStartFrame: false,
    supportsEndFrame: false,
    supportsStartEndFrame: false,
    supportsMultipleKeyframes: false,
    supportsReferenceFrames: false,
    supportsImageToVideo: false,
    supportsTextToVideo: true,
    ...overrides,
  });

  it("identifies the requested conditioning mode", () => {
    expect(requestedMode(base)).toBe("text_to_video");
    expect(requestedMode({ ...base, startFrame: frame("a", "START", 0) })).toBe("start_frame");
    expect(requestedMode({ ...base, startFrame: frame("a", "START", 0), endFrame: frame("b", "END", 10) })).toBe("start_end_frames");
    expect(requestedMode({ ...base, keyframes: [frame("k", "KEYFRAME", 5)] })).toBe("multiple_keyframes");
    expect(requestedMode({ ...base, characterReferences: [{ assetId: "c", kind: "character", checksum: "x" }] })).toBe("reference_conditioned");
  });

  it("refuses a request the selected model cannot honour instead of dropping frames", () => {
    const request = { ...base, startFrame: frame("a", "START", 0) };
    const result = checkCapabilities(request, caps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not support start-frame/);

    expect(checkCapabilities(request, caps({ supportsStartFrame: true })).ok).toBe(true);
  });

  it("refuses start+end when only start is supported", () => {
    const request = { ...base, startFrame: frame("a", "START", 0), endFrame: frame("b", "END", 10) };
    const result = checkCapabilities(request, caps({ supportsStartFrame: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/start\+end frame/);
  });

  it("flags frames outside the shot duration and misplaced anchors", () => {
    const problems = validateFrameTimeline({
      keyframes: [frame("k", "KEYFRAME", 99)],
      startFrame: frame("s", "START", 2),
      endFrame: frame("e", "END", 4),
      duration: 10,
    });
    expect(problems.join(" ")).toMatch(/outside the shot duration/);
    expect(problems.join(" ")).toMatch(/start frame must sit at 0s/);
    expect(problems.join(" ")).toMatch(/end frame must sit at 10s/);
  });

  it("accepts a well-formed timeline", () => {
    expect(
      validateFrameTimeline({
        keyframes: [frame("k", "KEYFRAME", 5)],
        startFrame: frame("s", "START", 0),
        endFrame: frame("e", "END", 10),
        duration: 10,
      }),
    ).toEqual([]);
  });
});
