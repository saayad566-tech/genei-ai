import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checkCompatibility, downloadModel, executeModel, listLocalModels,
  removeLocalModel, searchModels, toStoreModel, modelsDir,
} from "./aiStore";

/**
 * AI Store service.
 *
 * These tests are about the promises the store makes: a search that reports why it is
 * empty, a fit estimate that says it is an estimate, a download that refuses a partial
 * file, and an execution path that names what is missing rather than returning nothing.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-store-"));
const realFetch = globalThis.fetch;
afterEach(() => { vi.unstubAllGlobals(); globalThis.fetch = realFetch; });

describe("search", () => {
  it("classifies what the Hub returns", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", pipeline_tag: "text-generation", tags: ["gguf", "code"], downloads: 330467, likes: 120 },
    ]), { status: 200 })));

    const result = await searchModels({ query: "qwen", ggufOnly: true });
    expect(result.source).toBe("huggingface");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].profile.primary).toBe("coding");
    expect(result.models[0].downloads).toBe(330467);
  });

  it("filters by capability after classifying, not before", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", pipeline_tag: "text-generation", tags: ["code"] },
      { id: "Qwen/Qwen2.5-7B-Instruct-GGUF", pipeline_tag: "text-generation", tags: ["chat"] },
    ]), { status: 200 })));

    const result = await searchModels({ capability: "coding" });
    expect(result.models).toHaveLength(1);
    expect(result.models[0].id).toContain("Coder");
  });

  it("says why the result is empty rather than returning a bare empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    const result = await searchModels({ capability: "coding" });
    expect(result.models).toEqual([]);
    expect(result.note).toMatch(/nothing in the top results is classified as coding/i);
  });

  it("reports an HTTP failure instead of pretending there were no models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    const result = await searchModels({ query: "x" });
    expect(result.models).toEqual([]);
    expect(result.note).toMatch(/HTTP 503/);
  });

  it("reports an unreachable Hub", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")));
    const result = await searchModels({ query: "x" });
    expect(result.note).toMatch(/could not be reached/i);
  });

  it("does not consult the network when offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchModels({ query: "x" }, { offline: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.note).toMatch(/not consulted/i);
  });
});

describe("compatibility", () => {
  const file = (gb: number) => [{ path: "m-Q4_K_M.gguf", sizeBytes: Math.round(gb * 1024 ** 3), url: "https://example/m.gguf", recommended: true }];

  it("says it is an estimate and names the memory it compared against", () => {
    const verdict = checkCompatibility(file(4), { ramGB: 16, vramGB: null, backends: ["cpu"] });
    expect(verdict.status).toBe("fits");
    expect(verdict.reason).toMatch(/estimate/i);
    expect(verdict.reason).toMatch(/16 GB/);
    expect(verdict.estimatedRamGB).toBeGreaterThan(4); // weights plus headroom
  });

  it("flags a model that will not fit, and says what to do", () => {
    const verdict = checkCompatibility(file(30), { ramGB: 8, vramGB: null, backends: ["cpu"] });
    expect(verdict.status).toBe("too-large");
    expect(verdict.reason).toMatch(/smaller quantisation|hosted endpoint/i);
  });

  it("calls a close fit tight rather than comfortable", () => {
    const verdict = checkCompatibility(file(7), { ramGB: 8, vramGB: null, backends: ["cpu"] });
    expect(["tight", "too-large"]).toContain(verdict.status);
  });

  it("prefers video memory when there is any", () => {
    const verdict = checkCompatibility(file(4), { ramGB: 64, vramGB: 6, backends: ["cuda"] });
    expect(verdict.reason).toMatch(/video memory/);
  });

  it("says fit is unknown when memory cannot be read", () => {
    const verdict = checkCompatibility(file(4), { ramGB: null, vramGB: null, backends: ["cpu"] });
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toMatch(/could not be read/i);
  });

  it("says unknown when there is no file to measure", () => {
    expect(checkCompatibility([], { ramGB: 16, vramGB: null, backends: ["cpu"] }).status).toBe("unknown");
  });
});

describe("download", () => {
  it("writes the file and verifies its size", async () => {
    const dir = tmp();
    const body = new Uint8Array(2048).fill(7);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const result = await downloadModel({ id: "org/model", filePath: "model.gguf", url: "https://example/model.gguf", expectedBytes: 2048, dataDir: dir });
    expect(result.ok).toBe(true);
    expect(fs.statSync(result.path!).size).toBe(2048);
    expect(listLocalModels(dir)).toHaveLength(1);
  });

  it("discards a short download instead of keeping a broken model", async () => {
    const dir = tmp();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(100), { status: 200 })));

    const result = await downloadModel({ id: "org/model", filePath: "model.gguf", url: "https://example/model.gguf", expectedBytes: 2048, dataDir: dir });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/discarded/i);
    expect(listLocalModels(dir)).toHaveLength(0);
    expect(fs.readdirSync(path.join(modelsDir(dir), "org/model")).some((f) => f.endsWith(".part"))).toBe(false);
  });

  it("reports a refused download", async () => {
    const dir = tmp();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 401 })));
    const result = await downloadModel({ id: "org/model", filePath: "m.gguf", url: "https://example/m.gguf", expectedBytes: 10, dataDir: dir });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/HTTP 401/);
  });

  it("recognises an already-complete install", async () => {
    const dir = tmp();
    const target = path.join(modelsDir(dir), "org/model");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "model.gguf"), Buffer.alloc(2048));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadModel({ id: "org/model", filePath: "model.gguf", url: "https://example/model.gguf", expectedBytes: 2048, dataDir: dir });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/already installed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces a file of the wrong size rather than trusting it", async () => {
    const dir = tmp();
    const target = path.join(modelsDir(dir), "org/model");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "model.gguf"), Buffer.alloc(10));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(2048), { status: 200 })));

    const result = await downloadModel({ id: "org/model", filePath: "model.gguf", url: "https://example/model.gguf", expectedBytes: 2048, dataDir: dir });
    expect(result.ok).toBe(true);
    expect(fs.statSync(result.path!).size).toBe(2048);
  });
});

describe("removal", () => {
  it("refuses to leave the models directory", () => {
    const dir = tmp();
    const result = removeLocalModel(dir, "../../etc/passwd");
    expect(result.removed).toBe(false);
    expect(result.message).toMatch(/outside the models directory/i);
  });

  it("says when there is nothing to remove", () => {
    expect(removeLocalModel(tmp(), "org/missing").removed).toBe(false);
  });
});

describe("execution is honest about what is missing", () => {
  it("refuses a local run with no downloaded weights, and says why", async () => {
    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "local" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/not downloaded/i);
  });

  it("refuses a local run when the runtime is absent", async () => {
    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "local", localPath: "/tmp/model.gguf" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/llama\.cpp runtime is not installed/i);
  });

  it("refuses a hosted run with no token", async () => {
    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "hosted" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/no hugging face token is stored/i);
  });

  it("calls the OpenAI-compatible router and returns its content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Hello." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "hosted", token: "hf_test" });
    expect(outcome).toMatchObject({ status: "completed", content: "Hello.", via: "huggingface-router" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://router.huggingface.co/v1/chat/completions");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).authorization).toBe("Bearer hf_test");
  });

  it("surfaces the provider's own error rather than an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Model not available for your account" } }), { status: 403 })));
    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "hosted", token: "hf_test" });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.error).toMatch(/Model not available/);
  });

  it("treats a response with no content as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    const outcome = await executeModel({ modelId: "org/model", messages: [{ role: "user", content: "hi" }], mode: "hosted", token: "hf_test" });
    expect(outcome.status).toBe("failed");
  });
});

describe("store model shape", () => {
  it("splits the Hub id into author and name", () => {
    const model = toStoreModel({ id: "Qwen/Qwen2.5-7B-Instruct-GGUF" });
    expect(model.author).toBe("Qwen");
    expect(model.name).toBe("Qwen2.5-7B-Instruct-GGUF");
  });

  it("treats an unnamespaced id as community", () => {
    const model = toStoreModel({ id: "gpt2" });
    expect(model.author).toBe("community");
    expect(model.name).toBe("gpt2");
  });
});
