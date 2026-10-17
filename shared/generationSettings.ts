/**
 * Generation settings contract.
 *
 * Single source of truth for the aspect ratio, frame rate and resolution a user can
 * choose before generating. Shared by the client controls and the server, so the
 * output size the UI promises is exactly the size the renderer is asked for.
 *
 * Nothing here has a hidden default that silently overrides a user choice: the
 * defaults are explicit, documented starting points that the UI shows as selected.
 */

export type AspectRatioId = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";
export type ResolutionId = "720p" | "1080p" | "4K";
export type FrameRateId = "24" | "30" | "60";

export type AspectRatioOption = {
  id: AspectRatioId;
  label: string;
  /** Where this shape is normally published. */
  useCase: string;
  /** width / height */
  ratio: number;
  /** Miniature frame for the selector, in px. */
  preview: { width: number; height: number };
};

export type ResolutionOption = {
  id: ResolutionId;
  label: string;
  /** The short side of the frame, in px. */
  shortSide: number;
  detail: string;
};

export type FrameRateOption = {
  id: FrameRateId;
  label: string;
  detail: string;
  /** What this rate is good for. */
  bestFor: string;
};

export const ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { id: "16:9", label: "16:9", useCase: "YouTube / Landscape", ratio: 16 / 9, preview: { width: 34, height: 19 } },
  { id: "9:16", label: "9:16", useCase: "Reels / TikTok / Shorts", ratio: 9 / 16, preview: { width: 19, height: 34 } },
  { id: "1:1", label: "1:1", useCase: "Square / Feed Posts", ratio: 1, preview: { width: 27, height: 27 } },
  { id: "4:5", label: "4:5", useCase: "Social Media Canvas", ratio: 4 / 5, preview: { width: 23, height: 29 } },
  { id: "21:9", label: "21:9", useCase: "Cinematic Ultrawide", ratio: 21 / 9, preview: { width: 38, height: 16 } },
] as const;

export const RESOLUTIONS: readonly ResolutionOption[] = [
  { id: "720p", label: "720p", shortSide: 720, detail: "HD — fastest to render" },
  { id: "1080p", label: "1080p", shortSide: 1080, detail: "Full HD — recommended" },
  { id: "4K", label: "4K", shortSide: 2160, detail: "Ultra HD — slowest, highest fidelity" },
] as const;

export const FRAME_RATES: readonly FrameRateOption[] = [
  { id: "24", label: "24 FPS", detail: "Cinematic", bestFor: "film look and motion blur" },
  { id: "30", label: "30 FPS", detail: "Standard", bestFor: "general video and social" },
  { id: "60", label: "60 FPS", detail: "Hyper-smooth", bestFor: "fast motion and action" },
] as const;

export type GenerationSettings = {
  aspectRatio: AspectRatioId;
  resolution: ResolutionId;
  fps: FrameRateId;
  /** Clip length in seconds. */
  durationSeconds: number;
};

/** Documented starting point shown as selected in the UI. */
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  aspectRatio: "16:9",
  resolution: "1080p",
  fps: "24",
  durationSeconds: 15,
};

export const DURATION_LIMITS = { min: 2, max: 600 } as const;

function roundToEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function getAspectRatio(id: AspectRatioId): AspectRatioOption {
  const found = ASPECT_RATIOS.find((option) => option.id === id);
  if (!found) throw new Error(`Unknown aspect ratio "${id}".`);
  return found;
}

export function getResolution(id: ResolutionId): ResolutionOption {
  const found = RESOLUTIONS.find((option) => option.id === id);
  if (!found) throw new Error(`Unknown resolution "${id}".`);
  return found;
}

export function getFrameRate(id: FrameRateId): FrameRateOption {
  const found = FRAME_RATES.find((option) => option.id === id);
  if (!found) throw new Error(`Unknown frame rate "${id}".`);
  return found;
}

/**
 * The exact pixel size for a combination. The chosen resolution sets the short
 * side; the long side follows the aspect ratio. Both dimensions are forced even,
 * because video encoders reject odd frame dimensions.
 */
export function resolveOutputSize(aspectRatio: AspectRatioId, resolution: ResolutionId): { width: number; height: number } {
  const aspect = getAspectRatio(aspectRatio);
  const short = getResolution(resolution).shortSide;
  if (aspect.ratio >= 1) {
    return { width: roundToEven(short * aspect.ratio), height: short };
  }
  return { width: short, height: roundToEven(short / aspect.ratio) };
}

export function frameCount(durationSeconds: number, fps: FrameRateId): number {
  return Math.max(1, Math.round(durationSeconds * Number(fps)));
}

/**
 * Rough working-set estimate for a shot, in MB, used to give the resource-aware
 * queue something honest to plan against. It models raw frame buffers (RGBA) held
 * during generation plus a decoding allowance; it is an estimate, and is labelled
 * as such wherever it is surfaced.
 */
export function estimateShotMemoryMB(settings: Pick<GenerationSettings, "aspectRatio" | "resolution" | "fps" | "durationSeconds">): number {
  const { width, height } = resolveOutputSize(settings.aspectRatio, settings.resolution);
  const frames = frameCount(settings.durationSeconds, settings.fps);
  const rawFrameMB = (width * height * 4) / (1024 * 1024);
  // Generation holds a small window of frames at a time, not the whole clip.
  const window = Math.min(frames, 24);
  return Math.round(rawFrameMbGuard(rawFrameMB) * window + 512);
}

function rawFrameMbGuard(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export type ValidationIssue = { field: string; message: string };

export function validateGenerationSettings(input: Partial<GenerationSettings>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.aspectRatio && !ASPECT_RATIOS.some((option) => option.id === input.aspectRatio)) {
    issues.push({ field: "aspectRatio", message: `"${input.aspectRatio}" is not one of the supported aspect ratios.` });
  }
  if (input.resolution && !RESOLUTIONS.some((option) => option.id === input.resolution)) {
    issues.push({ field: "resolution", message: `"${input.resolution}" is not one of the supported resolutions.` });
  }
  if (input.fps && !FRAME_RATES.some((option) => option.id === input.fps)) {
    issues.push({ field: "fps", message: `"${input.fps}" is not one of the supported frame rates.` });
  }
  if (input.durationSeconds !== undefined) {
    if (input.durationSeconds < DURATION_LIMITS.min || input.durationSeconds > DURATION_LIMITS.max) {
      issues.push({
        field: "durationSeconds",
        message: `Duration must be between ${DURATION_LIMITS.min} and ${DURATION_LIMITS.max} seconds.`,
      });
    }
  }
  return issues;
}
