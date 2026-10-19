/**
 * Real local inference, through the application's own adapter.
 *
 * This is the test that distinguishes "the adapter has code" from "the adapter produces
 * tokens". It starts a real `llama-server` against a real GGUF model, waits for it to
 * become ready, drives it through `LlamaCppAdapter`, and asserts that actual generated
 * text came back.
 *
 * It is opt-in by environment, because it needs two large things that are not always
 * present:
 *
 *   GENEI_LLAMA_BIN     path to the llama-server binary
 *   GENEI_LLAMA_MODEL   path to a .gguf model
 *
 * With them set, the test runs for real. Without them it skips and says so, rather than
 * passing quietly and implying coverage it does not have.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LlamaCppAdapter } from "./adapters/llamaCpp";

const BIN = process.env.GENEI_LLAMA_BIN?.trim() || "";
const MODEL = process.env.GENEI_LLAMA_MODEL?.trim() || "";
const PORT = Number(process.env.GENEI_LLAMA_TEST_PORT ?? 8099);
const BASE = `http://127.0.0.1:${PORT}`;

const available = Boolean(BIN && MODEL && fs.existsSync(BIN) && fs.existsSync(MODEL));

describe.skipIf(!available)("real local inference through LlamaCppAdapter", () => {
  let server: ChildProcess | null = null;

  beforeAll(async () => {
    server = spawn(BIN, [
      "-m", MODEL,
      "--port", String(PORT),
      "--host", "127.0.0.1",
      "-c", "2048",
      "--no-warmup",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Wait for the server to answer, with a bounded budget so a hang fails the test
    // rather than the whole run.
    const deadline = Date.now() + 90_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error("llama-server did not become ready within 90s");
      try {
        const response = await fetch(`${BASE}/health`);
        if (response.ok || response.status === 503) {
          const body = await response.json().catch(() => ({}));
          if ((body as { status?: string }).status === "ok") return;
        }
      } catch {
        // not up yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }, 120_000);

  afterAll(() => {
    // Always stop the server, or the process outlives the test.
    try { server?.kill("SIGKILL"); } catch { /* already gone */ }
  });

  it("reports ready only because the server genuinely answers", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: BASE, binaryPath: BIN, modelPath: MODEL, contextSize: 2048 });
    const status = await adapter.healthCheck();
    expect(status.state).toBe("ready");
  });

  it("generates real text from a real model", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: BASE, binaryPath: BIN, modelPath: MODEL, contextSize: 2048 });
    const result = await adapter.chat(
      [{ role: "user", content: "Reply with exactly: GENEI LOCAL INFERENCE WORKING" }],
      { maxTokens: 24, temperature: 0 },
    );
    expect(result.status, result.status === "failed" ? result.error : "").toBe("completed");
    if (result.status !== "completed") return;
    // The assertion that matters: real, non-empty content came back from the model.
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.content.toUpperCase()).toContain("GENEI");
  }, 120_000);

  it("reports an honest failure when pointed at a server that is not there", async () => {
    const adapter = new LlamaCppAdapter({ baseUrl: "http://127.0.0.1:9", binaryPath: BIN, modelPath: MODEL });
    const status = await adapter.healthCheck();
    expect(status.state).not.toBe("ready");
    const result = await adapter.chat([{ role: "user", content: "hi" }]);
    // A dead server is a failure, never an empty success.
    expect(result.status).toBe("failed");
  }, 60_000);
});
