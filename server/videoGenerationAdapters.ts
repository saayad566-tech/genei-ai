import { apiKeys } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as crypto from "crypto";
import { getDb } from "./db";

const ENCRYPTION_KEY = process.env.JWT_SECRET || "genei-secure-encryption-secret-key-32-bytes!!";
const RUNWAY_BASE_URL = process.env.GENEI_RUNWAY_API_BASE_URL || "https://api.dev.runwayml.com";
const RUNWAY_API_VERSION = process.env.GENEI_RUNWAY_API_VERSION || "2024-11-06";

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
  if (input.provider !== "runway") {
    return { taskId: `unsupported_${Date.now()}`, status: "failed", error: `Live submission adapter for ${input.provider} is not configured with its official task contract yet.` };
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
  if (provider !== "runway") {
    return { taskId, status: "failed", error: `Live polling adapter for ${provider} is not configured with its official task contract yet.` };
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
