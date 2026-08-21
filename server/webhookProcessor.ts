import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { directorJobs, directorShots, directorWebhookReceipts, directorJobAssets, directorNodeLogs } from "../drizzle/schema";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { webhookEvents } from "./webhookEvents";

export type WebhookProcessResult = {
  receiptId: number;
  receiptStatus: "applied" | "failed" | "ignored";
  externalTaskId: string;
  eventType: string;
  errorMessage?: string;
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function processVerifiedWebhookEvent(input: {
  db: Database;
  provider: string;
  payload: Record<string, any>;
  rawBody?: string;
  expectedUserId?: number;
  retryOfReceiptId?: number;
}): Promise<WebhookProcessResult> {
  const rawBody = input.rawBody ?? JSON.stringify(input.payload);
  const externalTaskId = String(input.payload.id || input.payload.task_id || input.payload.taskId || "").trim();
  const eventType = String(input.payload.status || input.payload.event || input.payload.task_status || "completed");
  if (!externalTaskId) throw new Error("Missing external task id in webhook payload");

  const allJobs = await input.db.select().from(directorJobs);
  const targetJob = allJobs.find((job) => {
    if (input.expectedUserId !== undefined && job.userId !== input.expectedUserId) return false;
    try {
      const metadata = job.metadata ? JSON.parse(job.metadata) : {};
      return metadata.externalTaskId === externalTaskId || metadata.taskId === externalTaskId;
    } catch {
      return false;
    }
  });

  let receiptStatus: "applied" | "failed" | "ignored" = "applied";
  let errorMessage: string | undefined;
  try {
    if (!targetJob) {
      receiptStatus = "ignored";
      throw new Error(`No matching job found for external task ID ${externalTaskId}`);
    }

    const normalizedEvent = eventType.toLowerCase();
    const isSuccess = ["succeeded", "succeed", "completed", "generated", "success"].includes(normalizedEvent);
    const isFailed = ["failed", "error", "blocked", "rejected"].includes(normalizedEvent);
    const nextStatus = isSuccess ? "completed" : isFailed ? "failed" : "running";
    const nextProgress = isSuccess ? 100 : isFailed ? targetJob.progress : Math.min(95, targetJob.progress + 25);

    await input.db.update(directorJobs).set({
      status: nextStatus,
      progress: nextProgress,
      error: isFailed ? String(input.payload.message || input.payload.error || "Provider reported task failure") : null,
      updatedAt: new Date(),
      finishedAt: isSuccess || isFailed ? new Date() : undefined,
    }).where(eq(directorJobs.id, targetJob.id));

    if (targetJob.shotId) {
      await input.db.update(directorShots).set({
        status: isSuccess ? "generated" : isFailed ? "failed" : "generating",
        updatedAt: new Date(),
      }).where(eq(directorShots.id, targetJob.shotId));
    }

    const outputs = input.payload.outputs || input.payload.output || input.payload.task_result?.videos || [];
    const mediaUrl = typeof outputs === "string" ? outputs : Array.isArray(outputs) ? outputs[0]?.url || outputs[0]?.mp4_url || outputs[0] : outputs.url;
    if (mediaUrl && typeof mediaUrl === "string") {
      let storageKey = `webhook-${targetJob.projectId}-${externalTaskId}.mp4`;
      let persistedUrl = mediaUrl;
      try {
        const response = await fetch(mediaUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const uploaded = await storagePut(storageKey, buffer, "video/mp4");
          storageKey = uploaded.key;
          persistedUrl = uploaded.url;
        }
      } catch {
        // Keep the provider URL when durable media persistence is temporarily unavailable.
      }

      await input.db.insert(directorJobAssets).values({
        userId: targetJob.userId,
        projectId: targetJob.projectId,
        sceneId: targetJob.sceneId,
        shotId: targetJob.shotId,
        jobId: targetJob.id,
        kind: "generated_video",
        source: input.provider,
        storageKey,
        storageUrl: persistedUrl,
        mimeType: "video/mp4",
        metadata: JSON.stringify(input.payload),
      });
      if (targetJob.shotId) {
        await input.db.update(directorShots).set({ assetUrl: persistedUrl, updatedAt: new Date() }).where(eq(directorShots.id, targetJob.shotId));
      }
    }

    await input.db.insert(directorNodeLogs).values({
      userId: targetJob.userId,
      projectId: targetJob.projectId,
      sceneId: targetJob.sceneId,
      shotId: targetJob.shotId,
      jobId: targetJob.id,
      nodeId: targetJob.shotId ? `shot-${targetJob.shotId}` : targetJob.sceneId ? `scene-${targetJob.sceneId}` : `job-${targetJob.id}`,
      level: isFailed ? "error" : "info",
      message: `User-verified webhook from ${input.provider}: task ${externalTaskId} status ${eventType}`,
      metadata: JSON.stringify(input.payload),
    });

    webhookEvents.emit("verified_webhook", {
      userId: targetJob.userId,
      projectId: targetJob.projectId,
      provider: input.provider,
      externalTaskId,
      eventType,
      status: nextStatus,
    });
  } catch (error) {
    if (receiptStatus !== "ignored") receiptStatus = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const inserted = await input.db.insert(directorWebhookReceipts).values({
    userId: targetJob?.userId || input.expectedUserId || 1,
    provider: input.provider,
    externalTaskId,
    eventType,
    payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
    payload: rawBody,
    retryOfReceiptId: input.retryOfReceiptId,
    status: receiptStatus,
    processedAt: new Date(),
  });

  return {
    receiptId: Number(inserted[0].insertId),
    receiptStatus,
    externalTaskId,
    eventType,
    ...(errorMessage ? { errorMessage } : {}),
  };
}
