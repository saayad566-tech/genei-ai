import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import { generateWithModel, getModelCapabilities } from "./modelGateway";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("model gateway fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedInvokeLLM.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "primary-model", owned_by: "test" }, { id: "fallback-model", owned_by: "test" }] }),
    }));
  });

  it("reports optional on-device eligibility while preserving the server fallback", async () => {
    const result = await getModelCapabilities({ webGpu: true, storage: true, online: true });

    expect(result.runtime.onDeviceEligible).toBe(true);
    expect(result.runtime.fallback).toBe("server");
    expect(result.models.every((model) => model.supportsAndroid)).toBe(true);
  });

  it("reports a live catalog and returns a successful server generation", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "response-live",
      created: 1,
      model: "primary-model",
      choices: [{ index: 0, message: { role: "assistant", content: "live succeeded" }, finish_reason: "stop" }],
    });

    const capabilities = await getModelCapabilities({ webGpu: true, storage: true, online: true });
    const result = await generateWithModel({ purpose: "chat", messages: [{ role: "user", content: "hello" }] });

    expect(capabilities.source).toBe("live");
    expect(result).toMatchObject({ content: "live succeeded", execution: "server", fallbackUsed: false, attempts: 1 });
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
  });

  it("retries with an alternate model after the first model fails", async () => {
    mockedInvokeLLM
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce({
        id: "response-1",
        created: 1,
        model: "fallback-model",
        choices: [{ index: 0, message: { role: "assistant", content: "fallback succeeded" }, finish_reason: "stop" }],
      });

    const result = await generateWithModel({
      purpose: "chat",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toBe("fallback succeeded");
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
  });
});
