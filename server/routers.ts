import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { generateImage } from "./_core/imageGeneration";
import { generateWithModel, getModelCapabilities } from "./modelGateway";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { assets, apiKeys, chatMessages, projects } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import * as crypto from "crypto";

// Versioned authenticated encryption for user API keys.
// Legacy values remain readable so existing connections can be migrated on update.
function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.JWT_SECRET || "genei-secret").digest();
}

function obfuscateKey(key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

function deobfuscateKey(encoded: string): string {
  if (!encoded.startsWith("v2:")) {
    const secret = process.env.JWT_SECRET || "genei-secret";
    const buf = Buffer.from(encoded, "base64");
    const secretBuf = Buffer.from(secret, "utf8");
    const result = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) result[i] = buf[i] ^ secretBuf[i % secretBuf.length];
    return result.toString("utf8");
  }

  const payload = Buffer.from(encoded.slice(3), "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── AI Features ──────────────────────────────────────────────────────────
  ai: router({
    capabilities: protectedProcedure.query(() => getModelCapabilities()),

    generateImage: protectedProcedure
      .input(z.object({ prompt: z.string().min(1).max(2000) }))
      .mutation(async ({ input }) => {
        const result = await generateImage({ prompt: input.prompt });
        return { url: result.url };
      }),

    chat: protectedProcedure
      .input(z.object({
        message: z.string().min(1).max(4000),
        sessionId: z.string().optional(),
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const response = await generateWithModel({
          purpose: "chat",
          messages: [
            {
              role: "system",
              content: "You are Genei AI, a concise and creative assistant for music, video, image, app, website, voice, and automation projects. Provide practical next steps and high-quality prompts.",
            },
            ...(input.history || []).map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
            { role: "user", content: input.message },
          ],
        });

        if (db) {
          await db.insert(chatMessages).values({ userId: ctx.user.id, role: "user", content: input.message, sessionId: input.sessionId });
          await db.insert(chatMessages).values({ userId: ctx.user.id, role: "assistant", content: response.content, sessionId: input.sessionId });
        }

        return { content: response.content, model: response.model, execution: response.execution, fallbackUsed: response.fallbackUsed, attempts: response.attempts };
      }),

    generateText: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1).max(8000),
        purpose: z.enum(["chat", "lyrics", "prompt", "vision"]).default("chat"),
      }))
      .mutation(async ({ input }) => generateWithModel({
        purpose: input.purpose,
        messages: [{ role: "user", content: input.prompt }],
      })),

    generateLyrics: protectedProcedure
      .input(z.object({
        topic: z.string().min(1).max(1000),
        genre: z.string().max(80).optional(),
        mood: z.string().max(80).optional(),
        language: z.string().max(80).optional(),
      }))
      .mutation(async ({ input }) => {
        const response = await generateWithModel({
          purpose: "lyrics",
          messages: [
            { role: "system", content: "You are an elite songwriter. Generate original lyrics with clear verse, chorus, and bridge labels. Do not imitate living artists." },
            { role: "user", content: `Write lyrics about: "${input.topic}". Genre: ${input.genre || "pop"}. Mood: ${input.mood || "energetic"}. Language: ${input.language || "English"}.` },
          ],
        });
        return { lyrics: response.content, model: response.model };
      }),

    generatePrompt: protectedProcedure
      .input(z.object({ type: z.string().max(80), description: z.string().min(1).max(2000) }))
      .mutation(async ({ input }) => {
        const response = await generateWithModel({
          purpose: "prompt",
          messages: [
            { role: "system", content: "You are an expert AI prompt engineer. Return one detailed, production-ready prompt and no preamble." },
            { role: "user", content: `Create a ${input.type} prompt for: "${input.description}".` },
          ],
        });
        return { prompt: response.content, model: response.model };
      }),
  }),

  // ── Assets ───────────────────────────────────────────────────────────────
  assets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(assets).where(eq(assets.userId, ctx.user.id)).orderBy(desc(assets.createdAt)).limit(100);
    }),

    save: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.string(),
        storageUrl: z.string(),
        storageKey: z.string(),
        prompt: z.string().optional(),
        projectId: z.number().optional(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const result = await db.insert(assets).values({
          userId: ctx.user.id,
          name: input.name,
          type: input.type,
          storageKey: input.storageKey,
          storageUrl: input.storageUrl,
          prompt: input.prompt,
          projectId: input.projectId,
          mimeType: input.mimeType,
          size: input.size || 0,
        });
        return { id: Number(result[0].insertId) };
      }),

    importRemote: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.string().default("image"),
        remoteUrl: z.string().url(),
        prompt: z.string().max(4000).optional(),
        mimeType: z.string().max(128).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const remote = await fetch(input.remoteUrl, { signal: AbortSignal.timeout(30_000) });
        if (!remote.ok) throw new Error(`Unable to download generated asset (${remote.status})`);
        const contentType = input.mimeType || remote.headers.get("content-type") || "image/png";
        if (!contentType.startsWith("image/")) throw new Error("Generated asset is not an image");
        const bytes = Buffer.from(await remote.arrayBuffer());
        if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Generated asset is larger than 25 MB");
        const storageKey = `users/${ctx.user.id}/assets/${crypto.randomUUID()}.bin`;
        const stored = await storagePut(storageKey, bytes, contentType);
        const result = await db.insert(assets).values({
          userId: ctx.user.id,
          name: input.name,
          type: input.type,
          storageKey: stored.key,
          storageUrl: stored.url,
          prompt: input.prompt,
          mimeType: contentType,
          size: bytes.byteLength,
        });
        return { id: Number(result[0].insertId), url: stored.url, key: stored.key };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.delete(assets).where(and(eq(assets.id, input.id), eq(assets.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ── Projects ─────────────────────────────────────────────────────────────
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(projects).where(eq(projects.userId, ctx.user.id)).orderBy(desc(projects.updatedAt)).limit(50);
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        type: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const result = await db.insert(projects).values({
          userId: ctx.user.id,
          title: input.title,
          type: input.type,
          description: input.description,
          status: "draft",
        });
        return { id: Number(result[0].insertId) };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.delete(projects).where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ── API Keys ─────────────────────────────────────────────────────────────
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: apiKeys.id,
        provider: apiKeys.provider,
        label: apiKeys.label,
        isActive: apiKeys.isActive,
        usageCount: apiKeys.usageCount,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      }).from(apiKeys).where(eq(apiKeys.userId, ctx.user.id)).orderBy(desc(apiKeys.createdAt));
    }),

    add: protectedProcedure
      .input(z.object({
        provider: z.string().min(1).max(64),
        key: z.string().min(1),
        label: z.string().max(128).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const encrypted = obfuscateKey(input.key);
        // Check if provider already exists for this user
        const existing = await db.select().from(apiKeys)
          .where(and(eq(apiKeys.userId, ctx.user.id), eq(apiKeys.provider, input.provider)))
          .limit(1);
        if (existing.length > 0) {
          await db.update(apiKeys)
            .set({ encryptedKey: encrypted, label: input.label, isActive: true, updatedAt: new Date() })
            .where(and(eq(apiKeys.userId, ctx.user.id), eq(apiKeys.provider, input.provider)));
          return { id: existing[0].id };
        }
        const result = await db.insert(apiKeys).values({
          userId: ctx.user.id,
          provider: input.provider,
          label: input.label,
          encryptedKey: encrypted,
          isActive: true,
          usageCount: 0,
        });
        return { id: Number(result[0].insertId) };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.delete(apiKeys).where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)));
        return { success: true };
      }),

    toggle: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await db.select().from(apiKeys)
          .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)))
          .limit(1);
        if (!existing.length) throw new Error("Key not found");
        await db.update(apiKeys)
          .set({ isActive: !existing[0].isActive })
          .where(eq(apiKeys.id, input.id));
        return { success: true };
      }),
  }),

  // ── Chat History ─────────────────────────────────────────────────────────
  chat: router({
    history: protectedProcedure
      .input(z.object({ sessionId: z.string().optional(), limit: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const query = db.select().from(chatMessages)
          .where(eq(chatMessages.userId, ctx.user.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(input.limit);
        return (await query).reverse();
      }),

    clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(chatMessages).where(eq(chatMessages.userId, ctx.user.id));
      return { success: true };
    }),
  }),

  // ── Stats ─────────────────────────────────────────────────────────────────
  stats: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalAssets: 0, totalProjects: 0, totalApiKeys: 0, totalMessages: 0 };
      const [assetCount, projectCount, apiKeyCount, messageCount] = await Promise.all([
        db.select().from(assets).where(eq(assets.userId, ctx.user.id)),
        db.select().from(projects).where(eq(projects.userId, ctx.user.id)),
        db.select().from(apiKeys).where(eq(apiKeys.userId, ctx.user.id)),
        db.select().from(chatMessages).where(eq(chatMessages.userId, ctx.user.id)),
      ]);
      return {
        totalAssets: assetCount.length,
        totalProjects: projectCount.length,
        totalApiKeys: apiKeyCount.length,
        totalMessages: messageCount.length,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
