/**
 * Model advisor.
 *
 * Answers the question a fit check alone cannot: *which file should I actually download?*
 *
 * Given every file in a repository and this machine's memory, it ranks the quantisations
 * that fit, explains the trade-off in plain terms, and — when nothing fits — names the
 * smaller quantisations or smaller models that would. It never recommends a file it has
 * not measured, and it says when a recommendation is an estimate.
 */
import type { ModelFile, Compatibility } from "./aiStore";

export type Advice = {
  /** The file to download, if one is suitable. */
  recommended?: ModelFile;
  /** Everything that fits, best first. */
  options: Array<{ file: ModelFile; estimatedRamGB: number; note: string }>;
  /** Files that do not fit, with the reason. */
  rejected: Array<{ file: ModelFile; estimatedRamGB: number; reason: string }>;
  summary: string;
  /** True when the figures are estimates rather than measurements. */
  estimated: true;
};

/** Quality ranking of common GGUF quantisations, best first. */
const QUALITY_ORDER: Array<{ pattern: RegExp; label: string; quality: number; note: string }> = [
  { pattern: /f16|fp16|bf16/i, label: "F16", quality: 100, note: "Full precision: the best quality and the largest file." },
  { pattern: /q8_0/i, label: "Q8_0", quality: 92, note: "Near-lossless, still large." },
  { pattern: /q6_k/i, label: "Q6_K", quality: 88, note: "Very close to the original quality." },
  { pattern: /q5_k_m/i, label: "Q5_K_M", quality: 84, note: "A good balance when you have the memory." },
  { pattern: /q5_k_s/i, label: "Q5_K_S", quality: 81, note: "Slightly smaller than Q5_K_M." },
  { pattern: /q4_k_m/i, label: "Q4_K_M", quality: 76, note: "The usual choice: most of the quality at a much smaller size." },
  { pattern: /q4_k_s/i, label: "Q4_K_S", quality: 72, note: "A little smaller again." },
  { pattern: /q4_0|q4_1/i, label: "Q4_0", quality: 68, note: "Older 4-bit format; prefer Q4_K_M if it is available." },
  { pattern: /q3_k_m|q3_k_s/i, label: "Q3_K", quality: 58, note: "Noticeably degraded; use only to fit." },
  { pattern: /q2_k/i, label: "Q2_K", quality: 42, note: "Heavily compressed. Expect real quality loss." },
  { pattern: /iq\d/i, label: "IQ", quality: 70, note: "Importance-aware quantisation." },
];

export function quantisationLabel(filePath: string): { label: string; quality: number; note: string } {
  for (const entry of QUALITY_ORDER) {
    if (entry.pattern.test(filePath)) return { label: entry.label, quality: entry.quality, note: entry.note };
  }
  return { label: "unknown", quality: 50, note: "The quantisation is not stated in the file name." };
}

/**
 * Rank the files in a repository against this machine.
 *
 * The rule of thumb is the same one the fit check uses — weights plus about 20% for the
 * context window — and it is labelled an estimate everywhere it appears.
 */
export function advise(files: ModelFile[], memory: { availableGB: number | null; basis: string }): Advice {
  const candidates = files.filter((file) => /\.gguf$/i.test(file.path));
  const pool = candidates.length ? candidates : files;

  const scored = pool.map((file) => {
    const estimatedRamGB = Math.round((file.sizeBytes / 1024 ** 3) * 1.2 * 10) / 10;
    const { label, quality, note } = quantisationLabel(file.path);
    return { file, estimatedRamGB, label, quality, note };
  });

  const available = memory.availableGB;
  // `=== null` alone is not enough: an absent field arrives as `undefined`, which slips
  // past the check, makes every comparison NaN, and produces a confusing "nothing fits"
  // instead of the clear "memory could not be read". Treat any non-finite value as unknown.
  if (available === null || available === undefined || !Number.isFinite(available) || available <= 0) {
    return {
      options: [],
      rejected: [],
      summary: `This machine's memory could not be read, so no file can be recommended. The smallest is about ${scored.reduce((min, entry) => Math.min(min, entry.estimatedRamGB), Number.POSITIVE_INFINITY).toFixed(1)} GB.`,
      estimated: true,
    };
  }

  const fitting = scored.filter((entry) => entry.estimatedRamGB <= available * 0.9);
  const rejected = scored
    .filter((entry) => entry.estimatedRamGB > available * 0.9)
    .sort((a, b) => a.estimatedRamGB - b.estimatedRamGB)
    .map((entry) => ({
      file: entry.file,
      estimatedRamGB: entry.estimatedRamGB,
      reason: `About ${entry.estimatedRamGB} GB needed against ${available} GB of ${memory.basis}.`,
    }));

  if (fitting.length === 0) {
    const smallest = rejected[0];
    return {
      options: [],
      rejected,
      summary: `Nothing in this repository fits: the smallest is about ${smallest?.estimatedRamGB ?? "?"} GB against ${available} GB of ${memory.basis}. Choose a repository with smaller quantisations, a smaller model, or run this one hosted.`,
      estimated: true,
    };
  }

  // Prefer the highest quality that fits, but not if it uses more than 85% of memory —
  // a model that leaves nothing for the rest of the machine is not a good recommendation.
  const ranked = fitting.sort((a, b) => b.quality - a.quality);
  const comfortable = ranked.filter((entry) => entry.estimatedRamGB <= available * 0.85);
  const best = comfortable[0] ?? ranked[0];

  return {
    recommended: best.file,
    options: ranked.map((entry) => ({
      file: entry.file,
      estimatedRamGB: entry.estimatedRamGB,
      note: `${entry.label} — ${entry.note}`,
    })),
    rejected,
    summary: `Recommended ${quantisationLabel(best.file.path).label}: about ${best.estimatedRamGB} GB against ${available} GB of ${memory.basis}. ${comfortable.length === 0 ? "It will use most of the available memory." : ""}`.trim(),
    estimated: true,
  };
}

/** Turn a fit verdict into one plain sentence for the UI. */
export function explainFit(compatibility: Compatibility): string {
  switch (compatibility.status) {
    case "fits": return `This should run comfortably here. ${compatibility.reason}`;
    case "tight": return `This should run, but there will not be much room left. ${compatibility.reason}`;
    case "too-large": return `This is unlikely to run here. ${compatibility.reason}`;
    default: return compatibility.reason;
  }
}
