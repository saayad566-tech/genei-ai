import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LlamaCppAdapter } from "./adapters/llamaCpp";

/**
 * The local Director model adapter.
 *
 * Every assertion here is about honesty: the adapter must never claim a model it does
 * not have, never claim vision without a projector, and never produce text the server
 * did not return.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-llama-"));

function installed() {
  const dir = tmp();
  const binary = path.join(dir, "llama-server");
  const model = path.join(dir, "model.gguf");
  fs.writeFileSync(binary, "#!/bin/sh\nexit 0\n");
  fs.writeFileSync(model, "GGUF");
  return { dir, binary, model };
}

describe("llama.cpp adapter", () => {
  it("reports not_installed when nothing is configured", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("not_installed");
    expect(status.message).toMatch(/binary/);
    expect(status.message).toMatch(/model file/);
  });

  it("names exactly which part is missing", async () => {
    const { binary } = installed();
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: "/nonexistent/model.gguf" });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("not_installed");
    expect(status.message).toMatch(/model file/);
    expect(status.message).not.toMatch(/binary/);
  });

  it("reports stopped, not ready, when the files exist but no server answers", async () => {
    const { binary, model } = installed();
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: model });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("stopped");
    expect(status.message).toMatch(/not running/i);
  });

  it("does not claim vision unless a projector is configured", async () => {
    const { binary, model, dir } = installed();
    const textOnly = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: model });
    expect((await textOnly.getCapabilities()).vision).toBe(false);

    const mmproj = path.join(dir, "mmproj.gguf");
    fs.writeFileSync(mmproj, "GGUF");
    const multimodal = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: model, mmprojPath: mmproj });
    expect((await multimodal.getCapabilities()).vision).toBe(true);
  });

  it("flags a projector that was configured but is missing", async () => {
    const { binary, model } = installed();
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: model, mmprojPath: "/nope/mmproj.gguf" });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("not_installed");
    expect(status.message).toMatch(/mmproj/);
  });

  it("reports capabilities as unavailable while the model is missing", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" });
    const capabilities = await adapter.getCapabilities();
    expect(capabilities.chat).toBe(false);
    expect(capabilities.vision).toBe(false);
    expect(capabilities.local).toBe(true);
    expect(capabilities.requiresNetwork).toBe(false);
  });

  it("refuses to chat when it is not ready, rather than inventing an answer", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" });
    const result = await adapter.chat([{ role: "user", content: "hello" }]);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toMatch(/not ready|not_installed|missing/i);
    }
  });

  it("reports a failure when the server is unreachable, not an empty success", async () => {
    const { binary, model } = installed();
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: binary, modelPath: model });
    const result = await adapter.chat([{ role: "user", content: "hello" }]);
    expect(result.status).toBe("failed");
  });

  it("declares itself a local text tool with no network requirement", async () => {
    expect(new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" }).category).toBe("text");
    expect(new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" }).toolId).toBe("llama-cpp");
  });

  it("keeps recent log lines for the UI", () => {
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:1", binaryPath: "", modelPath: "" });
    expect(Array.isArray(adapter.getLogs())).toBe(true);
  });
});
