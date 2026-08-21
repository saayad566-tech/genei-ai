import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { apiKeys, directorWebhookReceipts } from "../../drizzle/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { processVerifiedWebhookEvent } from "../webhookProcessor";
import { z } from "zod/v4";
import { invokeLLM } from "../_core/llm";

export const globalSettingsRouter = router({
  getWebhookSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { webhookUrl: "", webhookSecret: "", enabled: false };
    const found = await db.select().from(apiKeys).where(and(eq(apiKeys.userId, ctx.user.id), eq(apiKeys.provider, "genei_webhook"))).limit(1);
    if (!found.length) return { webhookUrl: "", webhookSecret: "", enabled: false };
    try {
      const data = JSON.parse(found[0].encryptedKey);
      return { webhookUrl: data.webhookUrl || "", webhookSecret: data.webhookSecret || "", enabled: Boolean(data.enabled) };
    } catch {
      return { webhookUrl: "", webhookSecret: "", enabled: false };
    }
  }),

  saveWebhookSettings: protectedProcedure
    .input(z.object({ webhookUrl: z.string().max(1000), webhookSecret: z.string().max(255), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const existing = await db.select().from(apiKeys).where(and(eq(apiKeys.userId, ctx.user.id), eq(apiKeys.provider, "genei_webhook"))).limit(1);
      const payload = JSON.stringify(input);
      if (existing.length > 0) {
        await db.update(apiKeys).set({ encryptedKey: payload, updatedAt: new Date() }).where(eq(apiKeys.id, existing[0].id));
      } else {
        await db.insert(apiKeys).values({ userId: ctx.user.id, provider: "genei_webhook", encryptedKey: payload, label: "User Managed Webhook" });
      }
      return { success: true };
    }),

  retryWebhookReceipt: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const receiptRows = await db.select().from(directorWebhookReceipts).where(and(eq(directorWebhookReceipts.id, input.id), eq(directorWebhookReceipts.userId, ctx.user.id))).limit(1);
      const receipt = receiptRows[0];
      if (!receipt) throw new Error("Webhook event not found in your workspace");
      if (receipt.status !== "failed") throw new Error("Only failed webhook events can be retried");
      const latestRetry = await db.select().from(directorWebhookReceipts).where(eq(directorWebhookReceipts.retryOfReceiptId, receipt.id)).orderBy(desc(directorWebhookReceipts.createdAt)).limit(1);
      if (latestRetry[0]?.status === "applied") return { success: true, status: "already_applied" as const, receiptId: latestRetry[0].id };
      let payload: Record<string, any>;
      try {
        payload = JSON.parse(receipt.payload) as Record<string, any>;
      } catch {
        throw new Error("This stored webhook payload is not readable, so it cannot be retried");
      }
      const result = await processVerifiedWebhookEvent({ db, provider: receipt.provider, payload, rawBody: receipt.payload, expectedUserId: ctx.user.id, retryOfReceiptId: receipt.id });
      return { success: result.receiptStatus === "applied", status: result.receiptStatus, receiptId: result.receiptId, error: result.errorMessage };
    }),

  translateText: protectedProcedure
    .input(z.object({ text: z.string().min(1).max(10000), targetLanguage: z.enum(["en", "es", "fr", "ja"]) }))
    .mutation(async ({ input }) => {
      const langNames: Record<string, string> = { en: "English", es: "Spanish", fr: "French", ja: "Japanese" };
      const targetName = langNames[input.targetLanguage] || "English";
      const response = await invokeLLM({
        messages: [
          { role: "system", content: `You are a professional film localization assistant. Translate the following creative brief, script outline, or scene description into fluent ${targetName}, preserving all cinematic tone, formatting, and technical stage directions. Return only the translated text.` },
          { role: "user", content: input.text },
        ],
      });
      const translated = response.choices[0]?.message?.content || input.text;
      return { translated };
    }),

  getWebhookReceipts: protectedProcedure
    .input(z.object({
      search: z.string().max(255).optional(),
      status: z.enum(["received", "applied", "ignored", "failed"]).optional(),
      provider: z.string().max(64).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = [eq(directorWebhookReceipts.userId, ctx.user.id)];
      if (input?.status) filters.push(eq(directorWebhookReceipts.status, input.status));
      if (input?.provider) filters.push(eq(directorWebhookReceipts.provider, input.provider));
      const rows = await db.select().from(directorWebhookReceipts).where(and(...filters)).orderBy(desc(directorWebhookReceipts.createdAt)).limit(input?.limit ?? 50);
      const needle = input?.search?.trim().toLowerCase();
      if (!needle) return rows;
      return rows.filter((row) => `${row.provider} ${row.externalTaskId} ${row.eventType}`.toLowerCase().includes(needle));
    }),

  getWebhookReceiptSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { available: false as const, total: 0, failed: 0, received: 0, applied: 0, ignored: 0 };
    const grouped = await db.select({ status: directorWebhookReceipts.status, count: count() }).from(directorWebhookReceipts).where(eq(directorWebhookReceipts.userId, ctx.user.id)).groupBy(directorWebhookReceipts.status);
    const summary = { available: true as const, total: 0, failed: 0, received: 0, applied: 0, ignored: 0 };
    for (const row of grouped) {
      const value = Number(row.count);
      summary.total += value;
      if (row.status === "failed" || row.status === "received" || row.status === "applied" || row.status === "ignored") summary[row.status] += value;
    }
    return summary;
  }),

  getRecentWebhookReceipts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(directorWebhookReceipts).where(eq(directorWebhookReceipts.userId, ctx.user.id)).orderBy(desc(directorWebhookReceipts.createdAt)).limit(5);
    return rows;
  }),
});
