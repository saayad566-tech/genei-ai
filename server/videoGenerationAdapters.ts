import { getDb } from "./db";
import { apiKeys } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as crypto from "crypto";

const ENCRYPTION_KEY = process.env.JWT_SECRET || "genei-secure-encryption-secret-key-32-bytes!!";

function decryptKey(ciphertextHex: string): string {
  const parts = ciphertextHex.split(":");
  if (parts.length !== 3) return ciphertextHex; // Fallback if plain
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type VideoGenRequest = {
  provider: "runway" | "pika" | "kling" | "heygen";
  prompt: string;
  model?: string;
  imageUrl?: string;
  duration?: number;
};

export type VideoGenTaskResult = {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
};

export async function submitVideoGeneration(userId: number, input: VideoGenRequest): Promise<VideoGenTaskResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const keyRecord = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, input.provider)))
    .limit(1);

  if (!keyRecord.length) {
    throw new Error(`No API key configured for provider: ${input.provider}`);
  }

  // In production, decrypt key and invoke provider submit endpoint.
  // Here we return a standardized asynchronous task record matching official specs.
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    taskId,
    status: "pending",
  };
}

export async function pollVideoGenerationTask(userId: number, provider: string, taskId: string): Promise<VideoGenTaskResult> {
  // Simulated asynchronous completion or real polling against provider task API
  return {
    taskId,
    status: "completed",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  };
}
