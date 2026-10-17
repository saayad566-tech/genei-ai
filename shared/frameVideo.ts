/**
 * Frame-to-video contract.
 *
 * Implements the frame-conditioned generation contract: a shot may be generated from
 * a start frame, a start+end pair, or a timeline of keyframes, with optional
 * character/location/prop reference conditioning.
 *
 * The critical rule encoded here is capability gating: a model advertises which
 * conditioning modes it supports, and a request that asks for a mode the selected
 * model cannot do is refused or re-routed — frames are NEVER silently ignored.
 */

export type FrameType = "START" | "KEYFRAME" | "END" | "REFERENCE";

export type FrameAsset = {
  frameId: string;
  frameType: FrameType;
  /** Position on the shot timeline, in seconds. */
  timestamp: number;
  assetId: string;
  source: string;
  checksum: string;
  width: number;
  height: number;
  aspectRatio: string;
};

export type ReferenceAsset = {
  assetId: string;
  kind: "character" | "location" | "prop" | "style";
  checksum: string;
  /** Which canonical record this reference comes from. */
  canonicalId?: string;
};

export type FrameVideoRequest = {
  shotId: string;
  sceneId: string;
  sequenceId: string;
  startFrame?: FrameAsset;
  endFrame?: FrameAsset;
  keyframes: FrameAsset[];
  prompt: string;
  negativePrompt: string;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  cameraMovement: string;
  subjectMovement: string;
  transitionStyle: string;
  characterReferences: ReferenceAsset[];
  locationReferences: ReferenceAsset[];
  propReferences: ReferenceAsset[];
  seed: number;
  /** Empty means "the user has not chosen yet" — never a silent default. */
  model: string;
  workflow: string;
  reviewCriteria: string[];
  continuityRequirements: string[];
};

export type GeneratorCapabilities = {
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  supportsStartEndFrame: boolean;
  supportsMultipleKeyframes: boolean;
  supportsReferenceFrames: boolean;
  supportsImageToVideo: boolean;
  supportsTextToVideo: boolean;
  /** Optional factual notes, e.g. "end-frame conditioning is ignored below 3 s". */
  notes?: string[];
};

export type CapabilityCheck =
  | { ok: true; mode: FrameConditioningMode }
  | { ok: false; mode: FrameConditioningMode; reason: string };

export type FrameConditioningMode =
  | "text_to_video"
  | "image_to_video"
  | "start_frame"
  | "start_end_frames"
  | "multiple_keyframes"
  | "reference_conditioned";

/** Determine which conditioning mode a request is actually asking for. */
export function requestedMode(request: Pick<FrameVideoRequest, "startFrame" | "endFrame" | "keyframes" | "characterReferences" | "locationReferences" | "propReferences">): FrameConditioningMode {
  if (request.keyframes.length > 0) return "multiple_keyframes";
  if (request.startFrame && request.endFrame) return "start_end_frames";
  if (request.startFrame) return "start_frame";
  const hasReferences =
    request.characterReferences.length > 0 || request.locationReferences.length > 0 || request.propReferences.length > 0;
  if (hasReferences) return "reference_conditioned";
  return "text_to_video";
}

/**
 * Refuse a request whose conditioning mode the selected model cannot honour.
 * Returning `ok: false` here is what stops frames being quietly dropped.
 */
export function checkCapabilities(request: FrameVideoRequest, capabilities: GeneratorCapabilities): CapabilityCheck {
  const mode = requestedMode(request);
  const unsupported = (reason: string): CapabilityCheck => ({ ok: false, mode, reason });
  switch (mode) {
    case "multiple_keyframes":
      return capabilities.supportsMultipleKeyframes
        ? { ok: true, mode }
        : unsupported("The selected model does not support multiple keyframes; it would ignore them.");
    case "start_end_frames":
      return capabilities.supportsStartEndFrame
        ? { ok: true, mode }
        : unsupported("The selected model does not support start+end frame conditioning; it would ignore one of the frames.");
    case "start_frame":
      return capabilities.supportsStartFrame
        ? { ok: true, mode }
        : unsupported("The selected model does not support start-frame conditioning.");
    case "reference_conditioned":
      return capabilities.supportsReferenceFrames
        ? { ok: true, mode }
        : unsupported("The selected model does not support reference-image conditioning.");
    case "image_to_video":
      return capabilities.supportsImageToVideo ? { ok: true, mode } : unsupported("The selected model does not support image-to-video.");
    case "text_to_video":
      return capabilities.supportsTextToVideo ? { ok: true, mode } : unsupported("The selected model does not support text-to-video.");
  }
}

/** Keyframes must be ordered and inside the shot's duration to be meaningful. */
export function validateFrameTimeline(request: Pick<FrameVideoRequest, "keyframes" | "startFrame" | "endFrame" | "duration">): string[] {
  const problems: string[] = [];
  const frames = [...request.keyframes].sort((a, b) => a.timestamp - b.timestamp);
  for (const frame of frames) {
    if (frame.timestamp < 0 || frame.timestamp > request.duration) {
      problems.push(`Frame ${frame.frameId} sits at ${frame.timestamp}s, outside the shot duration of ${request.duration}s.`);
    }
  }
  if (request.startFrame && request.startFrame.timestamp !== 0) {
    problems.push(`The start frame must sit at 0s, but is at ${request.startFrame.timestamp}s.`);
  }
  if (request.endFrame && Math.abs(request.endFrame.timestamp - request.duration) > 0.001) {
    problems.push(`The end frame must sit at ${request.duration}s, but is at ${request.endFrame.timestamp}s.`);
  }
  const seen = new Set<string>();
  for (const frame of frames) {
    if (seen.has(frame.frameId)) problems.push(`Frame id ${frame.frameId} appears more than once.`);
    seen.add(frame.frameId);
  }
  return problems;
}
