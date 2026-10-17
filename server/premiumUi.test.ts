import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ASPECT_RATIOS,
  FRAME_RATES,
  RESOLUTIONS,
  resolveOutputSize,
  frameCount,
  validateGenerationSettings,
  estimateShotMemoryMB,
  getAspectRatio,
} from "../shared/generationSettings";
import { TOOL_REGISTRY, assessCompatibility, getTool, recommendInstallSet, type HardwareProfile } from "./modelRegistry";
import { AssetInstaller, formatBytes } from "./assetDownloader";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-install-"));

describe("generation settings", () => {
  it("offers exactly the aspect ratios, frame rates and resolutions the platform promises", () => {
    expect(ASPECT_RATIOS.map((option) => option.id)).toEqual(["16:9", "9:16", "1:1", "4:5", "21:9"]);
    expect(FRAME_RATES.map((option) => option.id)).toEqual(["24", "30", "60"]);
    expect(RESOLUTIONS.map((option) => option.id)).toEqual(["720p", "1080p", "4K"]);
  });

  it("resolves the correct, even pixel dimensions for every combination", () => {
    expect(resolveOutputSize("16:9", "720p")).toEqual({ width: 1280, height: 720 });
    expect(resolveOutputSize("16:9", "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(resolveOutputSize("16:9", "4K")).toEqual({ width: 3840, height: 2160 });

    expect(resolveOutputSize("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(resolveOutputSize("1:1", "1080p")).toEqual({ width: 1080, height: 1080 });
    expect(resolveOutputSize("4:5", "1080p")).toEqual({ width: 1080, height: 1350 });
    expect(resolveOutputSize("21:9", "1080p")).toEqual({ width: 2520, height: 1080 });
    expect(resolveOutputSize("21:9", "4K")).toEqual({ width: 5040, height: 2160 });

    // Every combination must be even: encoders reject odd frame dimensions.
    for (const aspect of ASPECT_RATIOS) {
      for (const resolution of RESOLUTIONS) {
        const size = resolveOutputSize(aspect.id, resolution.id);
        expect(size.width % 2, `${aspect.id} ${resolution.id} width`).toBe(0);
        expect(size.height % 2, `${aspect.id} ${resolution.id} height`).toBe(0);
        // The aspect ratio must survive the rounding.
        expect(Math.abs(size.width / size.height - aspect.ratio)).toBeLessThan(0.02);
      }
    }
  });

  it("keeps the requested aspect ratio within rounding tolerance", () => {
    const size = resolveOutputSize("4:5", "720p");
    expect(size.width / size.height).toBeCloseTo(0.8, 2);
  });

  it("counts frames from duration and frame rate", () => {
    expect(frameCount(10, "24")).toBe(240);
    expect(frameCount(10, "30")).toBe(300);
    expect(frameCount(10, "60")).toBe(600);
    expect(frameCount(0.1, "24")).toBeGreaterThanOrEqual(1);
  });

  it("rejects unknown values and out-of-range durations", () => {
    expect(validateGenerationSettings({ aspectRatio: "16:9", resolution: "1080p", fps: "24" })).toEqual([]);
    const issues = validateGenerationSettings({ aspectRatio: "4:3" as never, resolution: "8K" as never, fps: "120" as never, durationSeconds: 5000 });
    expect(issues.map((issue) => issue.field).sort()).toEqual(["aspectRatio", "durationSeconds", "fps", "resolution"]);
  });

  it("scales the memory estimate with resolution and length", () => {
    const small = estimateShotMemoryMB({ aspectRatio: "16:9", resolution: "720p", fps: "24", durationSeconds: 5 });
    const large = estimateShotMemoryMB({ aspectRatio: "16:9", resolution: "4K", fps: "60", durationSeconds: 20 });
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it("throws rather than guessing at an unknown aspect ratio", () => {
    expect(() => getAspectRatio("3:2" as never)).toThrow(/Unknown aspect ratio/);
  });
});

describe("tool registry", () => {
  const nvidia: HardwareProfile = { os: "win32", ramGB: 32, vramGB: 24, backends: ["cuda", "cpu"] };

  it("lists every tool with a real source and a licence", () => {
    expect(TOOL_REGISTRY.length).toBeGreaterThan(5);
    for (const tool of TOOL_REGISTRY) {
      expect(tool.repositoryUrl, tool.id).toMatch(/^https:\/\//);
      expect(tool.license, tool.id).toBeTruthy();
      expect(tool.capabilities.length, tool.id).toBeGreaterThan(0);
    }
  });

  it("never claims compatibility it cannot establish", () => {
    const unknown: HardwareProfile = { os: "unknown", ramGB: null, vramGB: null, backends: ["cpu"] };
    for (const tool of TOOL_REGISTRY) {
      expect(assessCompatibility(tool, unknown).status, tool.id).toBe("unknown");
    }
  });

  it("flags a tool as unsupported when the OS or the backend is missing", () => {
    const mac: HardwareProfile = { os: "darwin", ramGB: 32, vramGB: 8, backends: ["metal", "cpu"] };
    const musetalk = getTool("musetalk");
    expect(musetalk).toBeDefined();
    expect(assessCompatibility(musetalk!, mac).status).toBe("unsupported");

    const noGpu: HardwareProfile = { os: "linux", ramGB: 32, vramGB: null, backends: ["cpu"] };
    const video = assessCompatibility(getTool("wan22")!, noGpu);
    expect(video.status).toBe("compatible_slow");
    expect(video.reasons.join(" ")).toMatch(/CPU/);
  });

  it("refuses a tool that needs more memory than the machine has", () => {
    const tiny: HardwareProfile = { os: "win32", ramGB: 4, vramGB: 2, backends: ["cuda", "cpu"] };
    const result = assessCompatibility(getTool("wan22")!, tiny);
    expect(result.status).toBe("unsupported");
    expect(result.reasons.join(" ")).toMatch(/at least/);
  });

  it("recommends a real set for a capable machine", () => {
    const recommended = recommendInstallSet(nvidia).map((entry) => entry.toolId);
    expect(recommended).toContain("ffmpeg");
    expect(recommended).toContain("comfyui");
  });

  it("marks tools whose weights need a source", () => {
    expect(getTool("wan22")!.requiresWeightSource).toBe(true);
    expect(getTool("comfyui")!.selfFetchingWeights).toBe(true);
  });
});

describe("asset installer", () => {
  it("claims nothing is installed before anything is installed", () => {
    const installer = new AssetInstaller(tmp());
    expect(installer.list()).toEqual([]);
    for (const tool of TOOL_REGISTRY) {
      expect(installer.get(tool.id).status, tool.id).toBe("not_installed");
      expect(installer.get(tool.id).installPath, tool.id).toBeNull();
    }
  });

  it("reports an unknown tool as failed rather than pretending to install it", async () => {
    const installer = new AssetInstaller(tmp());
    const record = await installer.install("not-a-real-tool");
    expect(record.status).toBe("failed");
    expect(record.message).toMatch(/Unknown tool/);
  });

  it("asks for a weights source instead of inventing a download URL", async () => {
    const installer = new AssetInstaller(tmp());
    const record = await installer.install("wan22");
    expect(record.status).toBe("needs_source");
    expect(record.message).toMatch(/needs a weights source/i);
    expect(record.installPath).toBeNull();
  });

  it("does not report a git tool as installed before any clone has happened", () => {
    const installer = new AssetInstaller(tmp());
    // Deliberately no network call in the suite: the honest pre-install state is
    // asserted instead, and the clone path is exercised by real use.
    const record = installer.get("comfyui");
    expect(record.status).toBe("not_installed");
    expect(record.installPath).toBeNull();
    expect(record.bytesDownloaded).toBe(0);
    expect(record.totalBytes).toBeNull();
  });

  it("cancels an install that is not running and says so", () => {
    const installer = new AssetInstaller(tmp());
    expect(installer.cancel("ffmpeg")).toBe(false);
  });

  it("persists install state so a restart remembers the truth", async () => {
    const dir = tmp();
    const first = new AssetInstaller(dir);
    await first.install("not-a-real-tool");
    const second = new AssetInstaller(dir);
    expect(second.get("not-a-real-tool").status).toBe("failed");
  });

  it("formats byte counts readably", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
