import express from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { directorJobs, directorShots, directorWebhookReceipts, directorJobAssets, directorNodeLogs } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "./storage";

export function registerDirectorWebhookRoutes(app: express.Express) {
  app.post("/api/director/webhook/:provider", express.json({ limit: "10mb" }), async (req, res) => {
    const provider = req.params.provider;
    const rawBody = JSON.stringify(req.body);
    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const signature = req.headers["x-webhook-signature"] || req.headers["x-signature"] || "";

    const secret = process.env.DIRECTOR_WEBHOOK_SECRET || (process.env.NODE_ENV === "production" ? "" : "genei-dev-webhook-secret");
    if (!secret) {
      return res.status(500).json({ success: false, error: "Webhook secret not configured on server" });
    }
    const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const isSignedValid = typeof signature === "string" && signature.length === computedSignature.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));

    if (!isSignedValid && process.env.NODE_ENV === "production") {
      return res.status(401).json({ success: false, error: "Invalid or missing webhook signature" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: "Database unavailable" });
    }

    const payload = req.body as Record<string, any>;
    const externalTaskId = String(payload.id || payload.task_id || payload.taskId || "").trim();
    const eventType = String(payload.status || payload.event || payload.task_status || "completed");

    if (!externalTaskId) {
      return res.status(400).json({ success: false, error: "Missing external task id in webhook payload" });
    }

    const existing = await db.select().from(directorWebhookReceipts).where(and(eq(directorWebhookReceipts.provider, provider), eq(directorWebhookReceipts.externalTaskId, externalTaskId), eq(directorWebhookReceipts.payloadHash, payloadHash))).limit(1);

    if (existing.length > 0 && existing[0].status === "applied") {
      return res.json({ success: true, status: "already_applied" });
    }

    let receiptStatus: "applied" | "failed" | "ignored" = "applied";
    let errorMessage: string | null = null;

    try {
      const allJobs = await db.select().from(directorJobs);
      const targetJob = allJobs.find((j) => {
        try {
          const meta = j.metadata ? JSON.parse(j.metadata) : {};
          return meta.externalTaskId === externalTaskId || meta.taskId === externalTaskId;
        } catch {
          return false;
        }
      });

      if (!targetJob) {
        receiptStatus = "ignored";
        throw new Error(`No matching job found for external task ID ${externalTaskId}`);
      }

      const isSuccess = ["succeeded", "succeed", "completed", "generated", "success"].includes(eventType.toLowerCase());
      const isFailed = ["failed", "error", "blocked", "rejected"].includes(eventType.toLowerCase());

      const nextStatus = isSuccess ? "completed" : isFailed ? "failed" : "running";
      const nextProgress = isSuccess ? 100 : isFailed ? targetJob.progress : Math.min(95, targetJob.progress + 25);

      await db.update(directorJobs).set({
        status: nextStatus,
        progress: nextProgress,
        error: isFailed ? String(payload.message || payload.error || "Provider reported task failure") : null,
        updatedAt: new Date(),
      }).where(eq(directorJobs.id, targetJob.id));

      if (targetJob.shotId) {
        await db.update(directorShots).set({
          status: isSuccess ? "generated" : isFailed ? "failed" : "generating",
          updatedAt: new Date(),
        }).where(eq(directorShots.id, targetJob.shotId));
      }

      const outputs = payload.outputs || payload.output || payload.task_result?.videos || [];
      const mediaUrl = typeof outputs === "string" ? outputs : Array.isArray(outputs) ? outputs[0]?.url || outputs[0]?.mp4_url || outputs[0] : outputs.url;

      if (mediaUrl && typeof mediaUrl === "string") {
        let storageKey = `webhook-${targetJob.projectId}-${externalTaskId}.mp4`;
        let persistedUrl = mediaUrl;
        try {
          const resp = await fetch(mediaUrl);
          if (resp.ok) {
            const buffer = Buffer.from(await resp.arrayBuffer());
            const uploaded = await storagePut(storageKey, buffer, "video/mp4");
            storageKey = uploaded.key;
            persistedUrl = uploaded.url;
          }
        } catch {
          // Fallback to direct URL if fetch/upload fails
        }

        await db.insert(directorJobAssets).values({
          userId: targetJob.userId,
          projectId: targetJob.projectId,
          sceneId: targetJob.sceneId,
          shotId: targetJob.shotId,
          jobId: targetJob.id,
          kind: "generated_video",
          source: provider,
          storageKey,
          storageUrl: persistedUrl,
          mimeType: "video/mp4",
          metadata: JSON.stringify(payload),
        });

        if (targetJob.shotId) {
          await db.update(directorShots).set({ assetUrl: persistedUrl, updatedAt: new Date() }).where(eq(directorShots.id, targetJob.shotId));
        }
      }

      await db.insert(directorNodeLogs).values({
        userId: targetJob.userId,
        projectId: targetJob.projectId,
        sceneId: targetJob.sceneId,
        shotId: targetJob.shotId,
        jobId: targetJob.id,
        nodeId: targetJob.shotId ? `shot-${targetJob.shotId}` : targetJob.sceneId ? `scene-${targetJob.sceneId}` : `job-${targetJob.id}`,
        level: isFailed ? "error" : "info",
        message: `Authenticated webhook from ${provider}: task ${externalTaskId} status ${eventType}`,
        metadata: JSON.stringify(payload),
      });
    } catch (error) {
      if (receiptStatus !== "ignored") {
        receiptStatus = "failed";
      }
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      await db.insert(directorWebhookReceipts).values({
        userId: 1,
        provider,
        externalTaskId,
        eventType,
        payloadHash,
        payload: rawBody,
        status: receiptStatus,
        processedAt: new Date(),
      });
    }

    if (receiptStatus === "failed") {
      return res.status(400).json({ success: false, error: errorMessage });
    }

    return res.json({ success: true, status: receiptStatus });
  });
}
