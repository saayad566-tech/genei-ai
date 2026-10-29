import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  activeModel,
  benchmarkFrom,
  CATALOGUE,
  cleanOrphans,
  detectDevice,
  diskUsage,
  estimateSizeGB,
  findModel,
  fitModel,
  inspectGguf,
  listInstalled,
  overheadFor,
  QUANTIZATIONS,
  quantProfile,
  recommendModels,
  registerInstalled,
  removeModel,
  switchActive,
  tooLargeFor,
  tuneFor,
  type DeviceProfile,
} from "./localModels";

/**
 * Local model manager.
 *
 * The interesting logic is the fit decision and the integrity check. Both are pure and both
 * are where a plausible-looking wrong answer does real damage: recommending a model that
 * cannot load, or accepting a truncated download as a working one.
 */

const device = (over: Partial<DeviceProfile> = {}): DeviceProfile => ({
  ramGB: 16,
  vramGB: 0,
  cores: 8,
  freeDiskGB: 100,
  platform: "linux",
  accelerator: "cpu",
  ...over,
});

/** Build a minimal but genuine GGUF header. */
function ggufBuffer(version = 3, tensorCount = 291): Buffer {
  const header = Buffer.alloc(64);
  header.write("GGUF", 0, "ascii");
  header.writeUInt32LE(version, 4);
  header.writeBigUInt64LE(BigInt(tensorCount), 8);
  return header;
}

describe("device detection", () => {
  it("rounds RAM down, because 15.9 GB is not 16", () => {
    const d = detectDevice();
    expect(Number.isInteger(d.ramGB)).toBe(true);
    expect(d.cores).toBeGreaterThan(0);
  });
});

describe("quantisation", () => {
  it("every catalogue quantisation has a profile", () => {
    for (const model of CATALOGUE) {
      for (const quant of model.quantizations) {
        expect(() => quantProfile(quant)).not.toThrow();
      }
    }
  });

  it("rejects an unknown quantisation rather than guessing", () => {
    expect(() => quantProfile("Q9_XX" as never)).toThrow(/Unknown quantisation/);
  });

  it("quality rises monotonically with size", () => {
    const ordered = [...QUANTIZATIONS].sort((a, b) => a.bytesPerParam - b.bytesPerParam);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].quality).toBeGreaterThanOrEqual(ordered[i - 1].quality);
    }
  });

  it("estimates a larger file for a bigger model", () => {
    expect(estimateSizeGB(7, "Q4_K_M")).toBeGreaterThan(estimateSizeGB(3, "Q4_K_M"));
  });
});

describe("fit", () => {
  it("picks a quantisation that fits a 16 GB machine", () => {
    const model = findModel("qwen2.5-7b-instruct")!;
    const fit = fitModel(model, device({ ramGB: 16 }));
    expect(fit).not.toBeNull();
    expect(fit!.runsOn).toBe("cpu");
    expect(fit!.requiredGB).toBeLessThanOrEqual(16 * 0.85);
  });

  it("returns null when nothing fits, rather than recommending something that cannot load", () => {
    const model = findModel("llama-3.3-70b-instruct")!;
    expect(fitModel(model, device({ ramGB: 8 }))).toBeNull();
  });

  it("prefers the GPU when VRAM is sufficient", () => {
    const model = findModel("qwen2.5-1.5b-instruct")!;
    const fit = fitModel(model, device({ vramGB: 12, ramGB: 32 }));
    expect(fit!.runsOn).toBe("gpu");
  });

  it("leaves headroom: does not recommend a model that consumes the whole machine", () => {
    const model = findModel("qwen2.5-7b-instruct")!;
    const fit = fitModel(model, device({ ramGB: 8 }));
    // 8 GB * 0.85 = 6.8 GB budget; a 7B Q4 plus overhead exceeds it, so no fit is offered.
    if (fit) expect(fit.requiredGB).toBeLessThanOrEqual(6.8);
  });

  it("explains its decision with real numbers", () => {
    const fit = fitModel(findModel("qwen2.5-3b-instruct") ?? findModel("llama-3.2-3b-instruct")!, device())!;
    expect(fit.explanation).toMatch(/GB/);
    expect(fit.explanation).toMatch(/estimate/i);
  });

  it("recommends larger models first when several fit", () => {
    const recs = recommendModels(device({ ramGB: 32, vramGB: 24 }));
    expect(recs.length).toBeGreaterThan(1);
    expect(recs[0].model.parametersB).toBeGreaterThanOrEqual(recs[recs.length - 1].model.parametersB);
  });

  it("reports what a too-large model would need", () => {
    const tooBig = tooLargeFor(device({ ramGB: 8 }));
    expect(tooBig.length).toBeGreaterThan(0);
    for (const entry of tooBig) expect(entry.needsGB).toBeGreaterThan(0);
  });

  it("accounts for runtime overhead beyond the weights", () => {
    const model = findModel("qwen2.5-7b-instruct")!;
    expect(overheadFor(model, "Q4_K_M")).toBeGreaterThan(0);
  });
});

describe("tuning", () => {
  it("leaves one core free so the interface stays responsive", () => {
    const tuning = tuneFor(findModel("qwen2.5-1.5b-instruct")!, "Q4_K_M", device({ cores: 8 }));
    expect(tuning.threads).toBe(7);
  });

  it("never returns zero threads on a single-core machine", () => {
    const tuning = tuneFor(findModel("qwen2.5-1.5b-instruct")!, "Q4_K_M", device({ cores: 1 }));
    expect(tuning.threads).toBeGreaterThanOrEqual(1);
  });

  it("offloads to GPU only when VRAM actually covers it", () => {
    const gpu = tuneFor(findModel("qwen2.5-1.5b-instruct")!, "Q4_K_M", device({ vramGB: 12 }));
    expect(gpu.gpuLayers).toBeGreaterThan(0);
    const cpu = tuneFor(findModel("qwen2.5-1.5b-instruct")!, "Q4_K_M", device({ vramGB: 0 }));
    expect(cpu.gpuLayers).toBe(0);
  });

  it("caps context below the model maximum and says why", () => {
    const tuning = tuneFor(findModel("llama-3.2-3b-instruct")!, "Q4_K_M", device());
    expect(tuning.contextTokens).toBeLessThanOrEqual(16384);
    expect(tuning.rationale.join(" ")).toMatch(/KV cache/i);
  });
});

describe("GGUF integrity", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "genei-gguf-"));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("accepts a real GGUF header", async () => {
    const file = path.join(dir, "good.gguf");
    await fs.writeFile(file, ggufBuffer());
    const info = inspectGguf(file);
    expect(info.ok).toBe(true);
    expect(info.version).toBe(3);
    expect(info.tensorCount).toBe(291);
  });

  it("rejects an HTML error page saved under a .gguf name", async () => {
    // The classic failed-download case: plausible name, plausible size, not a model.
    const file = path.join(dir, "error.gguf");
    await fs.writeFile(file, "<!DOCTYPE html><html><body>404 Not Found</body></html>");
    const info = inspectGguf(file);
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/Not a GGUF/i);
  });

  it("rejects a truncated file", async () => {
    const file = path.join(dir, "tiny.gguf");
    await fs.writeFile(file, Buffer.from("GGUF"));
    expect(inspectGguf(file).ok).toBe(false);
  });

  it("rejects an empty file", async () => {
    const file = path.join(dir, "empty.gguf");
    await fs.writeFile(file, "");
    const info = inspectGguf(file);
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/empty/i);
  });

  it("rejects a header declaring zero tensors", async () => {
    const file = path.join(dir, "zero.gguf");
    await fs.writeFile(file, ggufBuffer(3, 0));
    expect(inspectGguf(file).reason).toMatch(/zero tensors/i);
  });

  it("rejects an unsupported version", async () => {
    const file = path.join(dir, "v99.gguf");
    await fs.writeFile(file, ggufBuffer(99, 10));
    expect(inspectGguf(file).reason).toMatch(/not supported/i);
  });

  it("reports a missing file rather than throwing", () => {
    expect(inspectGguf("/definitely/not/here.gguf").ok).toBe(false);
  });
});

describe("installed store", () => {
  let dataDir: string;
  let saved: string | undefined;

  beforeEach(async () => {
    saved = process.env.GENEI_DESKTOP_DATA_DIR;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "genei-store-"));
    process.env.GENEI_DESKTOP_DATA_DIR = dataDir;
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.GENEI_DESKTOP_DATA_DIR;
    else process.env.GENEI_DESKTOP_DATA_DIR = saved;
  });

  async function install(name: string): Promise<string> {
    const file = path.join(dataDir, `${name}.gguf`);
    await fs.writeFile(file, ggufBuffer());
    const entry = await registerInstalled({ modelId: "qwen2.5-0.5b-instruct", quant: "Q4_K_M", filePath: file });
    return entry.id;
  }

  it("refuses to register a file that is not a usable model", async () => {
    const bad = path.join(dataDir, "bad.gguf");
    await fs.writeFile(bad, "not a model");
    await expect(
      registerInstalled({ modelId: "qwen2.5-0.5b-instruct", quant: "Q4_K_M", filePath: bad }),
    ).rejects.toThrow(/not a usable model/i);
  });

  it("refuses an unknown model id", async () => {
    const file = path.join(dataDir, "x.gguf");
    await fs.writeFile(file, ggufBuffer());
    await expect(registerInstalled({ modelId: "nope", quant: "Q4_K_M", filePath: file })).rejects.toThrow(/catalogue/i);
  });

  it("makes the first installed model active automatically", async () => {
    const id = await install("a");
    const state = await listInstalled();
    expect(state.activeId).toBe(id);
  });

  it("switches the active model", async () => {
    await install("a");
    const file = path.join(dataDir, "b.gguf");
    await fs.writeFile(file, ggufBuffer());
    const second = await registerInstalled({ modelId: "qwen2.5-1.5b-instruct", quant: "Q4_K_M", filePath: file });
    const state = await switchActive(second.id);
    expect(state.activeId).toBe(second.id);
  });

  it("refuses to switch to a model whose file has been deleted", async () => {
    const id = await install("gone");
    await fs.unlink(path.join(dataDir, "gone.gguf"));
    await expect(switchActive(id)).rejects.toThrow(/cannot be activated/i);
  });

  it("keeps the file on disk when removing without deleteFile", async () => {
    const id = await install("keep");
    const state = await removeModel(id);
    expect(state.orphans.length).toBe(1);
    expect(await fs.stat(path.join(dataDir, "keep.gguf")).then(() => true).catch(() => false)).toBe(true);
  });

  it("deletes the file when asked", async () => {
    const id = await install("del");
    await removeModel(id, { deleteFile: true });
    expect(await fs.stat(path.join(dataDir, "del.gguf")).then(() => true).catch(() => false)).toBe(false);
  });

  it("falls back to another model when the active one is removed", async () => {
    const first = await install("a");
    const file = path.join(dataDir, "b.gguf");
    await fs.writeFile(file, ggufBuffer());
    const second = await registerInstalled({ modelId: "qwen2.5-1.5b-instruct", quant: "Q4_K_M", filePath: file });
    await switchActive(second.id);
    const state = await removeModel(second.id);
    expect(state.activeId).toBe(first);
  });

  it("reports the active model with its tuning", async () => {
    await install("a");
    const active = await activeModel();
    expect(active).not.toBeNull();
    expect(active!.tuning.threads).toBeGreaterThan(0);
  });

  it("reports disk usage including orphans", async () => {
    const id = await install("a");
    await removeModel(id);
    const usage = await diskUsage();
    expect(usage.orphanBytes).toBeGreaterThan(0);
  });

  it("cleans orphaned files and reports the reclaim", async () => {
    const id = await install("a");
    await removeModel(id);
    const result = await cleanOrphans();
    expect(result.reclaimedBytes).toBeGreaterThan(0);
    expect((await listInstalled()).orphans).toEqual([]);
  });

  it("returns null from activeModel when nothing is installed", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "genei-empty-"));
    process.env.GENEI_DESKTOP_DATA_DIR = empty;
    expect(await activeModel()).toBeNull();
    process.env.GENEI_DESKTOP_DATA_DIR = dataDir;
  });
});

describe("benchmark", () => {
  it("computes throughput from real numbers", () => {
    const b = benchmarkFrom(100, 2000);
    expect(b.tokensPerSecond).toBe(50);
  });

  it("says it did not measure independently", () => {
    expect(benchmarkFrom(10, 1000).note).toMatch(/Not measured independently/i);
  });

  it("refuses a zero elapsed time rather than dividing by zero", () => {
    expect(() => benchmarkFrom(10, 0)).toThrow(/greater than zero/i);
  });
});
