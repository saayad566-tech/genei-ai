import { describe, expect, it } from "vitest";
import {
  checkInterpolationCapability,
  isInterpolationRequest,
  requestedMode,
  type FrameAsset,
  type FrameInterpolationRequest,
  type FrameVideoRequest,
  type GeneratorCapabilities,
} from "../shared/frameVideo";

const frame = (id: string): FrameAsset => ({ assetId: id, source: "generated", checksum: "abc", width: 1920, height: 1080, aspectRatio: "16:9" });

const capabilities = (overrides: Partial<GeneratorCapabilities> = {}): GeneratorCapabilities => ({
  supportsStartFrame: true,
  supportsEndFrame: true,
  supportsStartEndFrame: true,
  supportsMultipleKeyframes: true,
  supportsReferenceFrames: false,
  supportsImageToVideo: true,
  supportsTextToVideo: true,
  supportsInterpolation: false,
  ...overrides,
});

const interpolation = (overrides: Partial<FrameInterpolationRequest> = {}): FrameInterpolationRequest => ({
  shotId: "shot-1",
  firstFrame: frame("a"),
  secondFrame: frame("b"),
  factor: 2,
  outputFps: 48,
  model: "chosen-by-the-user",
  ...overrides,
});

const generation = (): FrameVideoRequest => ({
  shotId: "shot-1",
  sceneId: "scene-1",
  sequenceId: "seq-1",
  keyframes: [],
  prompt: "a lighthouse at dusk",
  negativePrompt: "no distortion",
  duration: 5,
  fps: 24,
  resolution: { width: 1920, height: 1080 },
  visualPrompt: "a lighthouse at dusk, wide",
  cameraMovement: "slow push in",
  subjectMovement: "the keeper turns to the camera",
  environmentMovement: "waves move, gulls cross the frame",
  transitionStyle: "cut",
  characterReferences: [],
  locationReferences: [],
  propReferences: [],
  seed: 1,
  model: "chosen-by-the-user",
  workflow: "wan22",
  reviewCriteria: [],
  continuityRequirements: [],
});

describe("frame interpolation is a separate capability", () => {
  it("tells an interpolation request apart from a generation request", () => {
    expect(isInterpolationRequest(interpolation())).toBe(true);
    expect(isInterpolationRequest(generation())).toBe(false);
    expect(isInterpolationRequest(null)).toBe(false);
    expect(isInterpolationRequest("nope")).toBe(false);
  });

  it("refuses interpolation when the model does not advertise it", () => {
    const check = checkInterpolationCapability(interpolation(), capabilities({ supportsInterpolation: false }));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/different capabilities/i);
    }
  });

  it("allows interpolation only when the model supports it", () => {
    expect(checkInterpolationCapability(interpolation(), capabilities({ supportsInterpolation: true })).ok).toBe(true);
  });

  it("rejects a factor that would not interpolate anything", () => {
    for (const factor of [0, 1, -2]) {
      const check = checkInterpolationCapability(interpolation({ factor }), capabilities({ supportsInterpolation: true }));
      expect(check.ok, `factor ${factor}`).toBe(false);
    }
  });

  it("does not let interpolation satisfy a start/end frame generation request", () => {
    // The two are routed separately: a model that interpolates is not thereby able to
    // generate motion from a semantic prompt.
    const check = checkInterpolationCapability(interpolation(), capabilities({ supportsInterpolation: false, supportsStartEndFrame: true }));
    expect(check.ok).toBe(false);
  });
});

describe("motion instructions are kept separate", () => {
  it("carries all five instructions rather than one combined prompt", () => {
    const request = generation();
    expect(request.visualPrompt).toBeTruthy();
    expect(request.cameraMovement).toBeTruthy();
    expect(request.subjectMovement).toBeTruthy();
    expect(request.environmentMovement).toBeTruthy();
    expect(request.transitionStyle).toBeTruthy();
    // They are genuinely distinct values, not the same string repeated.
    const distinct = new Set([
      request.visualPrompt,
      request.cameraMovement,
      request.subjectMovement,
      request.environmentMovement,
      request.transitionStyle,
    ]);
    expect(distinct.size).toBe(5);
  });

  it("still derives the conditioning mode from the frames, not the motion", () => {
    const request = generation();
    expect(requestedMode(request)).toBe("text_to_video");
    expect(requestedMode({ ...request, startFrame: frame("a") })).toBe("start_frame");
    expect(requestedMode({ ...request, startFrame: frame("a"), endFrame: frame("b") })).toBe("start_end_frames");
  });
});
