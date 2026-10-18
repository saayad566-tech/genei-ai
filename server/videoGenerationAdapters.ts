import { apiKeys } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as crypto from "crypto";
import { getDb } from "./db";

const ENCRYPTION_KEY = process.env.JWT_SECRET || "genei-secure-encryption-secret-key-32-bytes!!";
const RUNWAY_BASE_URL = process.env.GENEI_RUNWAY_API_BASE_URL || "https://api.dev.runwayml.com";
const RUNWAY_API_VERSION = process.env.GENEI_RUNWAY_API_VERSION || "2024-11-06";
// Kling AI Open Platform. The global host; the Singapore host is api-singapore.klingai.com.
const KLING_BASE_URL = process.env.GENEI_KLING_API_BASE_URL || "https://api.klingai.com";
// HeyGen. v1/v2 retire on 2026-10-31, so this targets the v3 API.
const HEYGEN_BASE_URL = process.env.GENEI_HEYGEN_API_BASE_URL || "https://api.heygen.com";

type StoredKey = { encryptedKey: string };

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function decryptKey(ciphertext: string): string {
  if (ciphertext.startsWith("v2:")) {
    const payload = Buffer.from(ciphertext.slice(3), "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  // Legacy webhook/API-key format retained for existing users.
  const parts = ciphertext.split(":");
  if (parts.length === 3) {
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch {
      // Fall through to legacy/plain storage compatibility.
    }
  }

  return ciphertext;
}

async function getProviderKey(userId: number, provider: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ encryptedKey: apiKeys.encryptedKey }).from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
    .limit(1) as StoredKey[];
  if (!rows.length) throw new Error(`No API key configured for ${provider}`);
  return decryptKey(rows[0].encryptedKey);
}

function runwayHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Runway-Version": RUNWAY_API_VERSION,
    "Content-Type": "application/json",
  };
}

function normalizeRunwayStatus(value: unknown): VideoGenTaskResult["status"] {
  const status = String(value || "").toUpperCase();
  if (["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(status)) return "completed";
  if (["FAILED", "CANCELED", "CANCELLED", "REJECTED"].includes(status)) return "failed";
  return "processing";
}

function runwayOutputUrl(data: any): string | undefined {
  const output = data?.output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (typeof output === "string") return output;
  return data?.video_url || data?.videoUrl || data?.output_url || data?.outputUrl;
}


/* ------------------------------------------------------------------ *
 * Kling AI Open Platform
 *
 * Documented contract:
 *   POST /v1/videos/text2video        -> { data: { task_id, task_status } }
 *   GET  /v1/videos/text2video/{id}   -> { data: { task_status, task_result.videos[0].url } }
 *   status: submitted | processing | succeed | failed
 * Auth is a short-lived HS256 JWT signed with the account's access key and secret key,
 * so the stored credential is "accessKey:secretKey".
 * ------------------------------------------------------------------ */

function klingJwt(credential: string): string {
  const [accessKey, secretKey] = credential.split(":");
  if (!accessKey || !secretKey) {
    throw new Error("Kling needs both an access key and a secret key, stored as \"accessKey:secretKey\".");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  // nbf is set slightly in the past so a small clock difference does not invalidate it.
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function normalizeKlingStatus(value: unknown): VideoGenTaskResult["status"] {
  const status = String(value || "").toLowerCase();
  if (["succeed", "succeeded", "success", "completed"].includes(status)) return "completed";
  if (["failed", "error"].includes(status)) return "failed";
  if (status === "submitted" || status === "pending") return "pending";
  return "processing";
}

/* ------------------------------------------------------------------ *
 * HeyGen (v3)
 *
 * Documented contract:
 *   POST /v3/video-agents              -> { data: { session_id, status, video_id } }
 *   GET  /v3/videos/{video_id}         -> { data: { id, status, video_url, failure_message } }
 *   status: pending | processing | completed | failed
 * Auth is the X-Api-Key header.
 * ------------------------------------------------------------------ */

function normalizeHeyGenStatus(value: unknown): VideoGenTaskResult["status"] {
  const status = String(value || "").toLowerCase();
  if (["completed", "complete", "success"].includes(status)) return "completed";
  if (["failed", "error"].includes(status)) return "failed";
  if (status === "pending" || status === "queued" || status === "submitted") return "pending";
  return "processing";
}

async function readJson(response: Response): Promise<any> {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

export type VideoGenRequest = {
  provider: "runway" | "pika" | "kling" | "heygen";
  prompt: string;
  model?: string;
  imageUrl?: string;
  duration?: number;
  ratio?: string;
};

export type VideoGenTaskResult = {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
};

export async function submitVideoGeneration(userId: number, input: VideoGenRequest): Promise<VideoGenTaskResult> {
  const apiKey = await getProviderKey(userId, input.provider);

  if (input.provider === "kling") {
    let token: string;
    try {
      token = klingJwt(apiKey);
    } catch (error) {
      return { taskId: `kling_${Date.now()}`, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const response = await fetch(`${KLING_BASE_URL}/v1/videos/text2video`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model_name: input.model || "kling-v2-6",
          prompt: input.prompt,
          aspect_ratio: input.ratio || "16:9",
          duration: String(input.duration && input.duration >= 10 ? 10 : 5),
          mode: "std",
        }),
      });
      const data = await readJson(response);
      if (!response.ok || (typeof data?.code === "number" && data.code !== 0)) {
        return { taskId: `kling_${Date.now()}`, status: "failed", error: `Kling API error (${response.status}): ${data?.message || data?.raw?.slice?.(0, 300) || "no message"}` };
      }
      const taskId = data?.data?.task_id;
      if (!taskId) return { taskId: `kling_${Date.now()}`, status: "failed", error: "Kling accepted the request but returned no task id." };
      return { taskId, status: normalizeKlingStatus(data?.data?.task_status) };
    } catch (error) {
      return { taskId: `kling_${Date.now()}`, status: "failed", error: `Kling could not be reached: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  if (input.provider === "heygen") {
    try {
      const response = await fetch(`${HEYGEN_BASE_URL}/v3/video-agents`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ prompt: input.prompt }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        return { taskId: `heygen_${Date.now()}`, status: "failed", error: `HeyGen API error (${response.status}): ${data?.message || data?.error || "no message"}` };
      }
      // The video id may already be assigned; otherwise the session id is the handle.
      const taskId = data?.data?.video_id || data?.data?.session_id;
      if (!taskId) return { taskId: `heygen_${Date.now()}`, status: "failed", error: "HeyGen accepted the request but returned neither a video id nor a session id." };
      return { taskId, status: normalizeHeyGenStatus(data?.data?.status) };
    } catch (error) {
      return { taskId: `heygen_${Date.now()}`, status: "failed", error: `HeyGen could not be reached: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  if (input.provider === "pika") {
    // Pika publishes no documented public generation API, so there is nothing honest to
    // call. This is reported as an absent contract rather than faked against a guess.
    return { taskId: `pika_${Date.now()}`, status: "failed", error: "Pika does not publish a documented public generation API, so no adapter can be implemented against it. Use Runway, Kling or HeyGen." };
  }

  const response = await fetch(`${RUNWAY_BASE_URL}/v1/image_to_video`, {
    method: "POST",
    headers: runwayHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: input.model || "gen4.5",
      promptText: input.prompt,
      ...(input.imageUrl ? { promptImage: input.imageUrl } : {}),
      ratio: input.ratio || "1280:720",
      duration: input.duration || 5,
    }),
  });

  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) {
    return { taskId: data.id || data.task_id || `runway_${Date.now()}`, status: "failed", error: `Runway API error (${response.status}): ${data.error || data.message || raw.slice(0, 300)}` };
  }

  const taskId = data.id || data.task_id;
  if (!taskId) return { taskId: `runway_${Date.now()}`, status: "failed", error: "Runway accepted the request but did not return a task ID." };
  return { taskId, status: "processing" };
}

export async function pollVideoGenerationTask(userId: number, provider: string, taskId: string): Promise<VideoGenTaskResult> {
  const apiKey = await getProviderKey(userId, provider);

  if (provider === "kling") {
    let token: string;
    try {
      token = klingJwt(apiKey);
    } catch (error) {
      return { taskId, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    const response = await fetch(`${KLING_BASE_URL}/v1/videos/text2video/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await readJson(response);
    if (!response.ok || (typeof data?.code === "number" && data.code !== 0)) {
      return { taskId, status: "failed", error: `Kling task lookup failed (${response.status}): ${data?.message || "no message"}` };
    }
    const status = normalizeKlingStatus(data?.data?.task_status);
    const url = data?.data?.task_result?.videos?.[0]?.url;
    return {
      taskId,
      status,
      ...(status === "completed" && url ? { videoUrl: url } : {}),
      ...(status === "failed" ? { error: data?.data?.task_status_msg || "Kling task failed." } : {}),
    };
  }

  if (provider === "heygen") {
    const response = await fetch(`${HEYGEN_BASE_URL}/v3/videos/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await readJson(response);
    if (!response.ok) {
      return { taskId, status: "failed", error: `HeyGen lookup failed (${response.status}): ${data?.message || data?.error || "no message"}` };
    }
    const status = normalizeHeyGenStatus(data?.data?.status);
    return {
      taskId,
      status,
      ...(status === "completed" && data?.data?.video_url ? { videoUrl: data.data.video_url } : {}),
      ...(status === "failed" ? { error: data?.data?.failure_message || "HeyGen task failed." } : {}),
    };
  }

  if (provider === "pika") {
    return { taskId, status: "failed", error: "Pika does not publish a documented public generation API, so there is no task to poll." };
  }

  const response = await fetch(`${RUNWAY_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: runwayHeaders(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) {
    return { taskId, status: "failed", error: `Runway task lookup failed (${response.status}): ${data.error || data.message || raw.slice(0, 300)}` };
  }

  const status = normalizeRunwayStatus(data.status);
  return {
    taskId,
    status,
    ...(status === "completed" ? { videoUrl: runwayOutputUrl(data) } : {}),
    ...(status === "failed" ? { error: data.failure || data.error || data.message || "Runway task failed." } : {}),
  };
}
