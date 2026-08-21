import express from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { directorJobs, directorWebhookReceipts, apiKeys } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { processVerifiedWebhookEvent } from "./webhookProcessor";

export function registerDirectorWebhookRoutes(app: express.Express) {
  app.post("/api/director/webhook/:provider", express.json({ limit: "10mb" }), async (req, res) => {
    const provider = req.params.provider;
    const rawBody = JSON.stringify(req.body);
    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const signature = req.headers["x-webhook-signature"] || req.headers["x-signature"] || "";
    const db = await getDb();
    if (!db) return res.status(500).json({ success: false, error: "Database unavailable" });

    const payload = req.body as Record<string, any>;
    const externalTaskId = String(payload.id || payload.task_id || payload.taskId || "").trim();
    if (!externalTaskId) return res.status(400).json({ success: false, error: "Missing external task id in webhook payload" });

    const allJobs = await db.select().from(directorJobs);
    const targetJob = allJobs.find((job) => {
      try {
        const metadata = job.metadata ? JSON.parse(job.metadata) : {};
        return metadata.externalTaskId === externalTaskId || metadata.taskId === externalTaskId;
      } catch {
        return false;
      }
    });

    let resolvedSecret = process.env.DIRECTOR_WEBHOOK_SECRET || (process.env.NODE_ENV === "production" ? "" : "genei-dev-webhook-secret");
    if (targetJob) {
      const userKeyRows = await db.select().from(apiKeys).where(and(eq(apiKeys.userId, targetJob.userId), eq(apiKeys.provider, "genei_webhook")));
      for (const row of userKeyRows) {
        try {
          const configData = JSON.parse(row.encryptedKey);
          if (typeof configData.webhookSecret === "string" && configData.webhookSecret) {
            resolvedSecret = configData.webhookSecret;
            break;
          }
        } catch {
          // Ignore malformed user settings and continue with the configured fallback.
        }
      }
    }
    if (!resolvedSecret) return res.status(500).json({ success: false, error: "Webhook secret not configured" });

    const computedSignature = crypto.createHmac("sha256", resolvedSecret).update(rawBody).digest("hex");
    const isSignedValid = typeof signature === "string" && signature.length === computedSignature.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));
    if (!isSignedValid && process.env.NODE_ENV === "production") return res.status(401).json({ success: false, error: "Invalid or missing webhook signature" });

    const existing = await db.select().from(directorWebhookReceipts).where(and(eq(directorWebhookReceipts.provider, provider), eq(directorWebhookReceipts.externalTaskId, externalTaskId), eq(directorWebhookReceipts.payloadHash, payloadHash))).limit(1);
    if (existing.length > 0 && existing[0].status === "applied") return res.json({ success: true, status: "already_applied" });

    const result = await processVerifiedWebhookEvent({ db, provider, payload, rawBody });
    if (result.receiptStatus === "failed") return res.status(400).json({ success: false, error: result.errorMessage });
    return res.json({ success: true, status: result.receiptStatus });
  });
}
