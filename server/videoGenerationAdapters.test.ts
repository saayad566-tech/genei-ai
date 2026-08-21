import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { pollVideoGenerationTask, submitVideoGeneration } from "./videoGenerationAdapters";
import * as crypto from "crypto";

vi.mock("./db", () => ({ getDb: vi.fn() }));

function encryptV2(value: string) {
  const key = crypto.createHash("sha256").update(process.env.JWT_SECRET || "genei-secure-encryption-secret-key-32-bytes!!").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v2:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

function mockDb(encryptedKey = encryptV2("runway-live-key")) {
  const limit = vi.fn().mockResolvedValue([{ encryptedKey }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

describe("real video generation adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb() as never);
  });

  it("submits Runway Gen-4.5 using the official image_to_video contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "runway-task-123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitVideoGeneration(7, { provider: "runway", prompt: "A cinematic sunrise over a quiet ocean", duration: 5, ratio: "1280:720" });

    expect(result).toEqual({ taskId: "runway-task-123", status: "processing" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.dev.runwayml.com/v1/image_to_video", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer runway-live-key", "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gen4.5", promptText: "A cinematic sunrise over a quiet ocean", ratio: "1280:720", duration: 5 }),
    }));
    vi.unstubAllGlobals();
  });

  it("polls Runway task status and returns the generated output URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "runway-task-123", status: "SUCCEEDED", output: ["https://cdn.example/video.mp4"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollVideoGenerationTask(7, "runway", "runway-task-123")).resolves.toEqual({ taskId: "runway-task-123", status: "completed", videoUrl: "https://cdn.example/video.mp4" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.dev.runwayml.com/v1/tasks/runway-task-123", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer runway-live-key", "X-Runway-Version": "2024-11-06" }) }));
    vi.unstubAllGlobals();
  });

  it("returns an explicit failed state for provider errors instead of a fake pending task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitVideoGeneration(7, { provider: "runway", prompt: "Test" })).resolves.toMatchObject({ status: "failed", error: expect.stringContaining("401") });
    vi.unstubAllGlobals();
  });

  it("does not claim live support for providers without an official adapter contract", async () => {
    await expect(submitVideoGeneration(7, { provider: "pika", prompt: "Test" })).resolves.toMatchObject({ status: "failed", error: expect.stringContaining("pika") });
  });
});
