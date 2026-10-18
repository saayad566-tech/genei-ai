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

  it("does not claim live support for a provider with no documented API", async () => {
    // Runway, Kling and HeyGen all have adapters now; Pika publishes no public contract,
    // so it must say that rather than pretend a request was sent.
    await expect(submitVideoGeneration(7, { provider: "pika", prompt: "Test" })).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("documented public generation API"),
    });
  });
  it("submits Kling with a signed JWT and the documented text2video contract", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("ak_test:sk_test")) as never);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { task_id: "kling-task-1", task_status: "submitted" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitVideoGeneration(7, { provider: "kling", prompt: "A lighthouse in a storm", duration: 5, ratio: "16:9" });

    expect(result).toEqual({ taskId: "kling-task-1", status: "pending" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.klingai.com/v1/videos/text2video");
    expect(init.method).toBe("POST");
    // The credential is an HS256 JWT signed with the access/secret pair, not the raw key.
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth.startsWith("Bearer ")).toBe(true);
    const [header, payload] = auth.slice(7).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).iss).toBe("ak_test");
    expect(JSON.parse(init.body)).toEqual({ model_name: "kling-v2-6", prompt: "A lighthouse in a storm", aspect_ratio: "16:9", duration: "5", mode: "std" });
    vi.unstubAllGlobals();
  });

  it("polls Kling and returns the finished video", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("ak_test:sk_test")) as never);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { task_status: "succeed", task_result: { videos: [{ id: "v1", url: "https://cdn.kling/v.mp4", duration: "5" }] } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollVideoGenerationTask(7, "kling", "kling-task-1")).resolves.toEqual({ taskId: "kling-task-1", status: "completed", videoUrl: "https://cdn.kling/v.mp4" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.klingai.com/v1/videos/text2video/kling-task-1");
    vi.unstubAllGlobals();
  });

  it("reports a Kling credential that is missing its secret key", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("ak_only")) as never);
    const result = await submitVideoGeneration(7, { provider: "kling", prompt: "x" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/access key and a secret key/i);
  });

  it("surfaces a Kling API error rather than pretending it was accepted", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("ak_test:sk_test")) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 1102, message: "Insufficient balance" }), { status: 200 })));
    const result = await submitVideoGeneration(7, { provider: "kling", prompt: "x" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Insufficient balance/);
    vi.unstubAllGlobals();
  });

  it("submits HeyGen through the v3 video-agent endpoint", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("heygen-key")) as never);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { session_id: "sess_abc", status: "generating", video_id: null } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitVideoGeneration(7, { provider: "heygen", prompt: "A presenter explaining the launch" });

    expect(result).toEqual({ taskId: "sess_abc", status: "processing" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.heygen.com/v3/video-agents");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("heygen-key");
    expect(JSON.parse(init.body)).toEqual({ prompt: "A presenter explaining the launch" });
    vi.unstubAllGlobals();
  });

  it("prefers the video id when HeyGen assigns one immediately", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("heygen-key")) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { session_id: "sess_abc", video_id: "vid_123", status: "processing" } }), { status: 200 })));
    const result = await submitVideoGeneration(7, { provider: "heygen", prompt: "x" });
    expect(result.taskId).toBe("vid_123");
    vi.unstubAllGlobals();
  });

  it("polls HeyGen v3 and returns the video URL", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("heygen-key")) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "vid_123", status: "completed", video_url: "https://files.heygen.ai/v.mp4" } }), { status: 200 })));
    await expect(pollVideoGenerationTask(7, "heygen", "vid_123")).resolves.toEqual({ taskId: "vid_123", status: "completed", videoUrl: "https://files.heygen.ai/v.mp4" });
    vi.unstubAllGlobals();
  });

  it("reports a HeyGen failure with the provider's own message", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("heygen-key")) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "vid_123", status: "failed", failure_message: "Script too long for selected avatar" } }), { status: 200 })));
    const result = await pollVideoGenerationTask(7, "heygen", "vid_123");
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Script too long/);
    vi.unstubAllGlobals();
  });

  it("says plainly that Pika has no documented public API instead of guessing one", async () => {
    vi.mocked(getDb).mockResolvedValue(mockDb(encryptV2("pika-key")) as never);
    const result = await submitVideoGeneration(7, { provider: "pika", prompt: "x" });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/does not publish a documented public generation API/i);
  });
});
