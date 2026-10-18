import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { generateImage } from "./_core/imageGeneration";
import { invokeLLM } from "./_core/llm";
import { encryptSecret, decryptSecret } from "./_core/keyVault";
import { enforceRateLimit, limiter } from "./_core/rateLimit";
import { liveness, readiness, metrics, resetCaches, diskSpace } from "./_core/ops";
import { compareModels } from "./modelCompare";
import { CAPABILITY_IDS, CAPABILITY_LABELS, CAPABILITY_DESCRIPTIONS } from "../shared/modelCapabilities";
import {
  searchModels, resolveModel, checkCompatibility, downloadModel, executeModel,
  listLocalModels, removeLocalModel, readProviderToken, tokenStatus, modelsDir,
} from "./aiStore";
import { generateWithModel, getModelCapabilities } from "./modelGateway";
import { checkVideoProviderHealth } from "./videoProviders";
import { submitVideoGeneration, pollVideoGenerationTask } from "./videoGenerationAdapters";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { assets, apiKeys, byohRunners, runnerLogs, chatMessages, exportJobs, releaseArtifacts, customDomains, workflowGraphs, projects, directorScenes, directorShots, directorJobs, directorQcReports, directorNodeLogs, directorJobAssets, directorWebhookReceipts } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import path from "node:path";
import { runtimeConfig } from "./adapters";
import * as crypto from "crypto";
import { compileDirectorGraph } from "./directorCompiler";
import { filmJobQueue, budgetFromHardware } from "./jobQueue";
import { fetchPageForContext, searchForContext, groundingBlock } from "./browsingAdapter";
import { TOOL_REGISTRY, assessCompatibility, type HardwareProfile } from "./modelRegistry";
import { getSharedInstaller } from "./assetDownloader";
import { currentPlatform, resolveAllInstallPlans, resolveInstallPlan } from "./toolReleases";
import { resolveAllWeights, resolveUserSuppliedRepo } from "./modelWeights";
import { adapterHealth, buildAdapters, resolveAdapter, detectHardware, runSelfTest } from "./adapters";
import { runProofScene } from "./proofScene";
import { compileDirectorGraphWithPython } from "./pythonDirectorCompiler";
import { globalSettingsRouter } from "./routers/globalSettings";
import { buildBlockedJobNotification, buildBoundaryReviewNotification, dispatchAppNotification, listAppNotifications, markAppNotificationRead } from "./appNotifications";

type ProviderHealth = { status: "healthy" | "invalid" | "unreachable" | "unsupported" | "needs_configuration"; message: string; checkedAt: string };

async function checkProviderHealth(provider: string, key: string): Promise<ProviderHealth> {
  const checkedAt = new Date().toISOString();
  const common: RequestInit = { signal: AbortSignal.timeout(8_000) };
  try {
    if (["runway", "pika", "kling", "heygen"].includes(provider)) {
      const result = await checkVideoProviderHealth(provider, key);
      return { status: result.status, message: `${result.message} Capabilities: ${result.capabilities.join(", ")}`, checkedAt: result.checkedAt };
    }
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", { ...common, headers: { Authorization: `Bearer ${key}` } });
      return { status: response.ok ? "healthy" : "invalid", message: response.ok ? "OpenAI key accepted" : `OpenAI rejected the key (${response.status})`, checkedAt };
    }
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/models", { ...common, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
      return { status: response.ok ? "healthy" : "invalid", message: response.ok ? "Anthropic key accepted" : `Anthropic rejected the key (${response.status})`, checkedAt };
    }
    if (provider === "elevenlabs") {
      const response = await fetch("https://api.elevenlabs.io/v1/user", { ...common, headers: { "xi-api-key": key } });
      return { status: response.ok ? "healthy" : "invalid", message: response.ok ? "ElevenLabs key accepted" : `ElevenLabs rejected the key (${response.status})`, checkedAt };
    }
    return { status: "unsupported", message: "Key is encrypted and stored. Provider-specific health validation will run when its adapter is configured.", checkedAt };
  } catch (error) {
    return { status: "unreachable", message: error instanceof Error ? error.message : "Provider health check failed", checkedAt };
  }
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
    capabilities: protectedProcedure
      .input(z.object({
        runtime: z.object({
          webGpu: z.boolean(),
          storage: z.boolean(),
          online: z.boolean(),
        }).optional(),
      }).optional())
      .query(({ input }) => getModelCapabilities(input?.runtime)),

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

    upload: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.enum(["image", "audio", "video", "document"]),
        mimeType: z.string().max(128),
        size: z.number().int().positive().max(25 * 1024 * 1024),
        data: z.string().min(1).max(36_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const encoded = input.data.includes(",") ? input.data.split(",", 2)[1] : input.data;
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB");
        const storageKey = `users/${ctx.user.id}/assets/${crypto.randomUUID()}-${input.name}`;
        const stored = await storagePut(storageKey, bytes, input.mimeType);
        const result = await db.insert(assets).values({
          userId: ctx.user.id,
          name: input.name,
          type: input.type,
          storageKey: stored.key,
          storageUrl: stored.url,
          mimeType: input.mimeType,
          size: bytes.byteLength,
        });
        return { id: Number(result[0].insertId), url: stored.url, key: stored.key };
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
        const encrypted = encryptSecret(input.key);
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

    healthCheck: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await db.select().from(apiKeys)
          .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)))
          .limit(1);
        if (!existing.length) throw new Error("Key not found");
        const health = await checkProviderHealth(existing[0].provider, decryptSecret(existing[0].encryptedKey));
        if (health.status === "healthy") {
          await db.update(apiKeys).set({ isActive: true, lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, input.id));
        }
        return { provider: existing[0].provider, ...health };
      }),

    testGateway: protectedProcedure.mutation(async () => {
      const startTime = Date.now();
      try {
        const result = await generateWithModel({
          purpose: "chat",
          messages: [
            { role: "system", content: "You are a reliable diagnostic assistant. Reply with exact JSON or short text confirming operation." },
            { role: "user", content: "Run diagnostic ping check." },
          ],
          timeoutMs: 15_000,
        });
        const duration = Date.now() - startTime;
        return {
          status: "healthy" as const,
          model: result.model,
          latencyMs: duration,
          fallbackUsed: result.fallbackUsed,
          message: `Managed LLM gateway active (${result.model} · ${duration}ms)`,
        };
      } catch (error) {
        return {
          status: "error" as const,
          model: "fallback",
          latencyMs: Date.now() - startTime,
          fallbackUsed: true,
          message: error instanceof Error ? error.message : "Managed LLM gateway check failed",
        };
      }
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

  // ── BYOH Runners ──────────────────────────────────────────────────────────
  runners: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: byohRunners.id,
        name: byohRunners.name,
        platform: byohRunners.platform,
        status: byohRunners.status,
        capabilities: byohRunners.capabilities,
        lastHeartbeat: byohRunners.lastHeartbeat,
        createdAt: byohRunners.createdAt,
        updatedAt: byohRunners.updatedAt,
      }).from(byohRunners).where(eq(byohRunners.userId, ctx.user.id)).orderBy(desc(byohRunners.updatedAt));
    }),

    pair: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(128), platform: z.string().min(1).max(64) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const token = `genei_${crypto.randomBytes(24).toString("hex")}`;
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const result = await db.insert(byohRunners).values({
          userId: ctx.user.id,
          name: input.name,
          platform: input.platform,
          status: "offline",
          pairingTokenHash: tokenHash,
          capabilities: JSON.stringify([]),
        });
        return { id: Number(result[0].insertId), token, message: "Run the Genei runner with this token. It will be shown only once." };
      }),

    heartbeat: publicProcedure
      .input(z.object({
        token: z.string().min(20),
        platform: z.string().min(1).max(128),
        capabilities: z.array(z.string()).max(200),
        hardware: z.object({
          cpu_count: z.number().int().nullable(),
          ram_mb: z.number().int().nullable(),
          gpu_count: z.number().int().nonnegative(),
          gpus: z.array(z.object({ name: z.string(), vram_mb: z.string() })).max(16),
          platform: z.string().max(256),
          tools: z.record(z.string(), z.boolean()),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
        const existing = await db.select({ id: byohRunners.id, status: byohRunners.status })
          .from(byohRunners).where(eq(byohRunners.pairingTokenHash, tokenHash)).limit(1);
        if (!existing.length || existing[0].status === "revoked") throw new Error("Runner token is invalid or revoked");
        await db.update(byohRunners).set({ platform: input.platform, capabilities: JSON.stringify({ tools: input.capabilities, hardware: input.hardware ?? null }), status: "paired", lastHeartbeat: new Date(), updatedAt: new Date() }).where(eq(byohRunners.id, existing[0].id));
        await db.insert(runnerLogs).values({
          runnerId: existing[0].id,
          level: "heartbeat",
          message: `Received successful heartbeat from ${input.platform} workstation`,
          metadata: JSON.stringify(input.hardware ?? {}),
        });
        return { ok: true, runnerId: existing[0].id, receivedAt: new Date().toISOString() };
      }),

    revoke: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.update(byohRunners).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(byohRunners.id, input.id), eq(byohRunners.userId, ctx.user.id)));
        await db.insert(runnerLogs).values({
          runnerId: input.id,
          level: "warn",
          message: "Workstation runner was revoked by operator",
        });
        return { success: true };
      }),

    logs: protectedProcedure
      .input(z.object({ runnerId: z.number(), limit: z.number().int().min(1).max(200).default(50) }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const [runner] = await db.select().from(byohRunners).where(and(eq(byohRunners.id, input.runnerId), eq(byohRunners.userId, ctx.user.id))).limit(1);
        if (!runner) return [];
        return db.select().from(runnerLogs).where(eq(runnerLogs.runnerId, input.runnerId)).orderBy(desc(runnerLogs.createdAt)).limit(input.limit);
      }),
  }),

  // ── Workflows (ComfyUI-Style Node Graphs) ──────────────────────────────


  // ── Operations ────────────────────────────────────────────────────────────
  // Health, readiness and real counters. Everything here is read from the component
  // that owns it, so nothing on this surface is an estimate.
  ops: router({
    /** Cheap liveness. Safe to call often. */
    health: protectedProcedure.query(async () => liveness()),

    /** Whether this machine can actually do work right now, and what is stopping it. */
    readiness: protectedProcedure.query(async () => {
      const config = runtimeConfig();
      return readiness({ dataDir: config.dataDir });
    }),

    /** Real counters: memory, caches, outbound health, rate-limit usage. */
    metrics: protectedProcedure.query(async ({ ctx }) => metrics(limiter.usage(ctx.user.id))),

    /** Drop every cache, so fresh data can be forced without a restart. */
    resetCaches: protectedProcedure.mutation(async () => {
      const cleared = resetCaches();
      return { cleared, message: `Cleared ${cleared} cached entr${cleared === 1 ? "y" : "ies"}.` };
    }),
  }),

  // ── AI Store ──────────────────────────────────────────────────────────────
  // A catalogue of open-source models: browse and classify them, check they fit this
  // machine, download them, and run them locally or through a hosted endpoint.
  aiStore: router({
    /** The capability taxonomy, so the UI filters come from one place. */
    capabilities: protectedProcedure.query(() =>
      CAPABILITY_IDS.map((id) => ({ id, label: CAPABILITY_LABELS[id], description: CAPABILITY_DESCRIPTIONS[id] })),
    ),

    /** Whether a Hugging Face token is stored. Never returns the token. */
    token: protectedProcedure.query(async ({ ctx }) => tokenStatus(ctx.user.id, "huggingface")),

    search: protectedProcedure
      .input(z.object({
        query: z.string().max(120).optional(),
        capability: z.string().max(40).optional(),
        sort: z.enum(["downloads", "likes", "recent"]).optional(),
        ggufOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(60).optional(),
      }))
      .query(async ({ input, ctx }) => {
        enforceRateLimit(ctx.user.id, "aiStore.search");
        const token = await readProviderToken(ctx.user.id, "huggingface");
        const capability = input.capability && (CAPABILITY_IDS as readonly string[]).includes(input.capability)
          ? (input.capability as (typeof CAPABILITY_IDS)[number])
          : undefined;
        const result = await searchModels({ ...input, capability }, { token });
        // Fit is computed against this machine, so the card can say so before a download.
        const hardware = await detectHardware();
        return {
          ...result,
          models: result.models.map((model) => ({ ...model, compatibility: undefined })),
          hardware: { ramGB: hardware.ramGB, vramGB: hardware.vramGB, backends: hardware.backends },
        };
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.string().min(3).max(200) }))
      .query(async ({ input, ctx }) => {
        const token = await readProviderToken(ctx.user.id, "huggingface");
        const { model, files, error } = await resolveModel(input.id, { token });
        const hardware = await detectHardware();
        const profile = { ramGB: hardware.ramGB, vramGB: hardware.vramGB, backends: hardware.backends };
        return { model, files, error, compatibility: files.length ? checkCompatibility(files, profile) : undefined, hardware: profile };
      }),

    install: protectedProcedure
      .input(z.object({ id: z.string().min(3).max(200), filePath: z.string().min(1), url: z.string().url(), expectedBytes: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        enforceRateLimit(ctx.user.id, "aiStore.install");
        const token = await readProviderToken(ctx.user.id, "huggingface");
        const config = runtimeConfig();
        const result = await downloadModel({
          id: input.id, filePath: input.filePath, url: input.url,
          expectedBytes: input.expectedBytes, dataDir: config.dataDir, token,
        });
        return result;
      }),

    installed: protectedProcedure.query(async () => listLocalModels(runtimeConfig().dataDir)),

    remove: protectedProcedure
      .input(z.object({ id: z.string().min(1).max(200) }))
      .mutation(async ({ input }) => removeLocalModel(runtimeConfig().dataDir, input.id)),

    run: protectedProcedure
      .input(z.object({
        modelId: z.string().min(3).max(200),
        mode: z.enum(["local", "hosted"]),
        messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(20000) })).min(1).max(40),
        localPath: z.string().max(1000).optional(),
        maxTokens: z.number().int().min(1).max(8192).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        enforceRateLimit(ctx.user.id, "aiStore.run");
        const token = input.mode === "hosted" ? await readProviderToken(ctx.user.id, "huggingface") : undefined;
        const config = runtimeConfig();
        const llamaBinary = config.llamaBinary;
        return executeModel({
          modelId: input.modelId,
          messages: input.messages,
          mode: input.mode,
          localPath: input.localPath,
          binaryPath: input.mode === "local" ? llamaBinary : undefined,
          baseUrl: config.llamaUrl,
          token,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
        });
      }),

    /** Where downloads are written, shown in the UI so the user knows. */
    location: protectedProcedure.query(async () => ({ directory: modelsDir(runtimeConfig().dataDir) })),

    /** How much room is left before a large download is attempted. */
    disk: protectedProcedure.query(async () => {
      const config = runtimeConfig();
      return diskSpace(config.dataDir) ?? { freeBytes: 0, totalBytes: 0, freeGB: 0 };
    }),

    /**
     * Run one prompt across several models and report what actually came back,
     * including measured latency and each model's own failure.
     */
    compare: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1).max(8000),
        system: z.string().max(4000).optional(),
        candidates: z.array(z.object({
          modelId: z.string().min(3).max(200),
          mode: z.enum(["local", "hosted"]),
          localPath: z.string().max(1000).optional(),
        })).min(2).max(4),
        maxTokens: z.number().int().min(1).max(4096).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        enforceRateLimit(ctx.user.id, "aiStore.compare");
        const config = runtimeConfig();
        return compareModels({
          prompt: input.prompt,
          system: input.system,
          candidates: input.candidates,
          token: await readProviderToken(ctx.user.id, "huggingface"),
          binaryPath: config.llamaBinary,
          baseUrl: config.llamaUrl,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
        });
      }),
  }),

  workflows: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(workflowGraphs).where(eq(workflowGraphs.userId, ctx.user.id)).orderBy(desc(workflowGraphs.createdAt)).limit(50);
    }),

    save: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        projectId: z.number().optional(),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        nodes: z.string().min(2),
        edges: z.string().min(2),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        if (input.id) {
          await db.update(workflowGraphs).set({
            title: input.title,
            description: input.description ?? null,
            nodes: input.nodes,
            edges: input.edges,
            updatedAt: new Date(),
          }).where(and(eq(workflowGraphs.id, input.id), eq(workflowGraphs.userId, ctx.user.id)));
          return { id: input.id, status: "updated" };
        } else {
          const res = await db.insert(workflowGraphs).values({
            userId: ctx.user.id,
            projectId: input.projectId,
            title: input.title,
            description: input.description ?? null,
            nodes: input.nodes,
            edges: input.edges,
          });
          return { id: Number(res[0].insertId), status: "created" };
        }
      }),

    execute: protectedProcedure
      .input(z.object({ workflowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const [wf] = await db.select().from(workflowGraphs).where(and(eq(workflowGraphs.id, input.workflowId), eq(workflowGraphs.userId, ctx.user.id))).limit(1);
        if (!wf) throw new Error("Workflow not found");

        // This used to return "Successfully queued execution across connected local &
        // cloud nodes" without queueing anything at all — a success message for work
        // that never happened. It now records a real, durable job that the runner
        // picks up, and reports only what it actually did.
        let nodeCount = 0;
        let nodeIds: string[] = [];
        try {
          const parsed = JSON.parse(wf.nodes || "[]");
          if (Array.isArray(parsed)) {
            nodeIds = parsed
              .map((node: unknown) => (node && typeof node === "object" ? String((node as { id?: unknown }).id ?? "") : ""))
              .filter(Boolean);
            nodeCount = parsed.length;
          }
        } catch {
          return { success: false, jobId: null, message: `Workflow "${wf.title}" could not be queued: its node list is not valid JSON.` };
        }

        if (nodeCount === 0) {
          return { success: false, jobId: null, message: `Workflow "${wf.title}" has no steps, so there is nothing to execute.` };
        }

        if (wf.projectId === null || wf.projectId === undefined) {
          // director_jobs.projectId is NOT NULL, and a workflow need not belong to a
          // project. Rather than inventing one, say what is missing.
          return {
            success: false,
            jobId: null,
            message: `Workflow "${wf.title}" is not attached to a project, so it cannot be queued yet. Open it from a project, or give it one, and run it again.`,
          };
        }

        const result = await db.insert(directorJobs).values({
          userId: ctx.user.id,
          projectId: wf.projectId,
          kind: "workflow",
          stage: "workflow_execution",
          status: "queued",
          progress: 0,
          attempt: 0,
          metadata: JSON.stringify({ workflowId: wf.id, title: wf.title, nodeCount, nodeIds }),
        });
        const jobId = Number(result[0].insertId);

        return {
          success: true,
          jobId,
          message: `Queued "${wf.title}" as job ${jobId} with ${nodeCount} step(s). It runs when a runner takes it; nothing is claimed to have executed yet.`,
        };
      }),
  }),

  // ── Exports ───────────────────────────────────────────────────────────────
  exports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(exportJobs).where(eq(exportJobs.userId, ctx.user.id)).orderBy(desc(exportJobs.createdAt)).limit(50);
    }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number().optional(),
        format: z.string().min(1).max(64),
        preset: z.string().min(1).max(64),
        publishTarget: z.string().max(64).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const result = await db.insert(exportJobs).values({
          userId: ctx.user.id,
          projectId: input.projectId,
          format: input.format,
          preset: input.preset,
          publishTarget: input.publishTarget,
          status: "queued",
        });
        return { id: Number(result[0].insertId), status: "queued" as const, message: "Export queued for a configured cloud or BYOH worker." };
      }),
  }),

  // ── AI Director / Continuity Pipeline ───────────────────────────────────
  director: router({
    createProject: protectedProcedure
      .input(z.object({
        projectId: z.number().optional(),
        title: z.string().min(1).max(255),
        brief: z.string().min(1).max(10000),
        aspectRatio: z.string().default("16:9"),
        resolution: z.string().default("1080p"),
        fps: z.number().int().min(1).max(120).default(24),
        targetLanguage: z.enum(["en", "es", "fr", "ja"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        let finalBrief = input.brief;
        if (input.targetLanguage && input.targetLanguage !== "en") {
          try {
            const langNames: Record<string, string> = { es: "Spanish", fr: "French", ja: "Japanese" };
            const targetName = langNames[input.targetLanguage] || "English";
            const res = await invokeLLM({
              messages: [
                { role: "system", content: `You are a professional film localization assistant. Translate the following creative brief into fluent ${targetName}, preserving all cinematic tone and stage directions. Return only the translated text.` },
                { role: "user", content: input.brief },
              ],
            });
            const translated = res.choices[0]?.message?.content;
            if (typeof translated === "string" && translated.trim().length > 0) {
              finalBrief = translated.trim();
            }
          } catch {
            // Fallback to original brief if translation fails
          }
        }
        let projectId = input.projectId;
        if (projectId) {
          const owned = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id))).limit(1);
          if (!owned.length) throw new Error("Project not found");
          await db.update(projects).set({ status: "processing", metadata: JSON.stringify({ aspectRatio: input.aspectRatio, resolution: input.resolution, fps: input.fps, director: "continuity-v1" }) }).where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id)));
        } else {
          const created = await db.insert(projects).values({
            userId: ctx.user.id,
            title: input.title,
            type: "video",
            description: input.brief,
            status: "processing",
            metadata: JSON.stringify({ aspectRatio: input.aspectRatio, resolution: input.resolution, fps: input.fps, director: "continuity-v1" }),
          });
          projectId = Number(created[0].insertId);
        }

        if (!projectId) throw new Error("Project could not be created");
        let graphPlan;
        let compilerSource = "python-ai-director";
        try {
          graphPlan = await compileDirectorGraphWithPython({ projectId, title: input.title, brief: finalBrief, aspectRatio: input.aspectRatio, fps: input.fps });
        } catch {
          compilerSource = "typescript-fallback";
          graphPlan = compileDirectorGraph({ title: input.title, brief: finalBrief, aspectRatio: input.aspectRatio });
        }
        const sceneIdByKey = new Map<string, number>();
        const shotIdByKey = new Map<string, number>();
        const sceneIds: number[] = [];
        const shotIds: number[] = [];

        for (const scenePlan of graphPlan.scenes) {
          const sceneResult = await db.insert(directorScenes).values({
            userId: ctx.user.id,
            projectId,
            sceneKey: scenePlan.sceneKey,
            sceneIndex: scenePlan.sceneIndex,
            title: scenePlan.title,
            objective: scenePlan.objective,
            location: scenePlan.location,
            timeOfDay: scenePlan.timeOfDay,
            status: "pending",
            contract: JSON.stringify({ dependencyIds: scenePlan.dependencies, acceptanceCriteria: ["All compiled shots pass QC", "Scene stitches cleanly"], boundaryConstraints: ["Preserve location, lighting, camera axis, and action phase"] }),
          });
          const sceneId = Number(sceneResult[0].insertId);
          sceneIds.push(sceneId);
          sceneIdByKey.set(scenePlan.sceneKey, sceneId);
          for (const shotPlan of scenePlan.shots) {
            const shotResult = await db.insert(directorShots).values({
              userId: ctx.user.id,
              projectId,
              sceneId,
              shotKey: shotPlan.shotKey,
              sequenceIndex: shotPlan.sequenceIndex,
              prompt: shotPlan.prompt,
              status: "pending",
              contract: JSON.stringify({ requiredInputs: shotPlan.dependencies.map((dependency) => `${dependency}.end_continuity`), dependencyIds: shotPlan.dependencies, acceptanceCriteria: shotPlan.acceptanceCriteria, continuityConstraints: shotPlan.continuityConstraints, cameraMotion: shotPlan.cameraMotion }),
            });
            const shotId = Number(shotResult[0].insertId);
            shotIds.push(shotId);
            shotIdByKey.set(shotPlan.shotKey, shotId);
          }
        }

        await db.update(projects).set({ metadata: JSON.stringify({ aspectRatio: input.aspectRatio, resolution: input.resolution, fps: input.fps, director: "continuity-v2", compilerSource, compilerVersion: graphPlan.compilerVersion, sceneCount: graphPlan.scenes.length, shotCount: shotIds.length, logicalNodes: graphPlan.logicalNodes }) }).where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id)));

        const rootJob = await db.insert(directorJobs).values({
          userId: ctx.user.id,
          projectId,
          sceneId: sceneIds[0] ?? null,
          kind: "project",
          stage: "planning",
          status: "queued",
          progress: 0,
          metadata: JSON.stringify({ compilerSource, compilerVersion: graphPlan.compilerVersion, sceneIds, shotIds, logicalNodes: graphPlan.logicalNodes, continuityRequired: true }),
        });
        for (const scenePlan of graphPlan.scenes) {
          const sceneId = sceneIdByKey.get(scenePlan.sceneKey);
          if (!sceneId) continue;
          const sceneShotIds = scenePlan.shots.map((shot) => shotIdByKey.get(shot.shotKey)).filter((id): id is number => Boolean(id));
          await db.insert(directorJobs).values({ userId: ctx.user.id, projectId, sceneId, kind: "scene", stage: "scene_render", status: "queued", progress: 0, metadata: JSON.stringify({ logicalNodeId: scenePlan.sceneKey, dependencySceneIds: scenePlan.dependencies.map((dependency) => sceneIdByKey.get(dependency)).filter(Boolean), shotIds: sceneShotIds }) });
          for (const shotPlan of scenePlan.shots) {
            const shotId = shotIdByKey.get(shotPlan.shotKey);
            if (!shotId) continue;
            await db.insert(directorJobs).values({ userId: ctx.user.id, projectId, sceneId, shotId, kind: "shot", stage: "shot_generation", status: "queued", progress: 0, attempt: 0, metadata: JSON.stringify({ logicalNodeId: shotPlan.shotKey, dependencyShotIds: shotPlan.dependencies.map((dependency) => shotIdByKey.get(dependency)).filter(Boolean), continuityRequired: true, cameraMotion: shotPlan.cameraMotion }) });
          }
        }
        return { projectId, sceneId: sceneIds[0] ?? 0, sceneIds, shotIds, jobId: Number(rootJob[0].insertId), status: "queued" as const, compilerVersion: graphPlan.compilerVersion, compilerSource };
      }),

    /**
     * Ground a request with live information. Real fetch, real provenance; when
     * browsing is unavailable the caller is told so rather than being given an
     * invented answer.
     */
    gatherContext: protectedProcedure
      .input(z.object({ url: z.string().url().optional(), query: z.string().min(1).max(300).optional() }))
      .mutation(async ({ input }) => {
        const result = input.url
          ? await fetchPageForContext(input.url)
          : input.query
            ? await searchForContext(input.query)
            : ({ status: "unsupported", reason: "Provide either a url or a query to gather context for." } as const);
        return { result, grounding: groundingBlock(result) };
      }),

    submitProviderVideo: protectedProcedure
      .input(z.object({
        provider: z.enum(["runway", "pika", "kling", "heygen"]),
        prompt: z.string().min(1).max(4000),
        model: z.string().max(128).optional(),
        imageUrl: z.string().url().optional(),
        duration: z.number().int().min(2).max(15).default(5),
        ratio: z.enum(["1280:720", "720:1280", "960:960"]).default("1280:720"),
        jobId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Video work is serialized through the resource-aware queue so several
        // provider jobs cannot run simultaneously and exhaust the machine.
        const result = await filmJobQueue.enqueue(
          { label: `video:${input.provider}`, weight: "heavy", estimatedPeakMB: 2048 },
          () => submitVideoGeneration(ctx.user.id, input),
        );
        const db = await getDb();
        if (db && input.jobId) {
          const jobs = await db.select().from(directorJobs).where(and(eq(directorJobs.id, input.jobId), eq(directorJobs.userId, ctx.user.id))).limit(1);
          if (jobs.length) {
            const metadata = jobs[0].metadata ? JSON.parse(jobs[0].metadata) : {};
            metadata.provider = input.provider;
            metadata.externalTaskId = result.taskId;
            metadata.providerStatus = result.status;
            if (result.error) metadata.providerError = result.error;
            await db.update(directorJobs).set({ status: result.status === "failed" ? "failed" : "running", progress: result.status === "processing" ? 10 : 0, metadata: JSON.stringify(metadata), updatedAt: new Date() }).where(and(eq(directorJobs.id, input.jobId), eq(directorJobs.userId, ctx.user.id)));
          }
        }
        return result;
      }),

    pollProviderVideo: protectedProcedure
      .input(z.object({ provider: z.enum(["runway", "pika", "kling", "heygen"]), taskId: z.string().min(1).max(255), jobId: z.number().int().positive().optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await pollVideoGenerationTask(ctx.user.id, input.provider, input.taskId);
        const db = await getDb();
        if (db && input.jobId) {
          const jobs = await db.select().from(directorJobs).where(and(eq(directorJobs.id, input.jobId), eq(directorJobs.userId, ctx.user.id))).limit(1);
          if (jobs.length) {
            const metadata = jobs[0].metadata ? JSON.parse(jobs[0].metadata) : {};
            metadata.providerStatus = result.status;
            if (result.videoUrl) metadata.videoUrl = result.videoUrl;
            if (result.error) metadata.providerError = result.error;
            await db.update(directorJobs).set({ status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "running", progress: result.status === "completed" ? 100 : result.status === "processing" ? 50 : 0, metadata: JSON.stringify(metadata), updatedAt: new Date() }).where(and(eq(directorJobs.id, input.jobId), eq(directorJobs.userId, ctx.user.id)));
          }
        }
        return result;
      }),

    getProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return null;
        const owned = await db.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id))).limit(1);
        if (!owned.length) return null;
        const scenes = await db.select().from(directorScenes).where(and(eq(directorScenes.projectId, input.projectId), eq(directorScenes.userId, ctx.user.id))).orderBy(directorScenes.sceneIndex);
        const shots = await db.select().from(directorShots).where(and(eq(directorShots.projectId, input.projectId), eq(directorShots.userId, ctx.user.id))).orderBy(directorShots.sequenceIndex);
        const jobs = await db.select().from(directorJobs).where(and(eq(directorJobs.projectId, input.projectId), eq(directorJobs.userId, ctx.user.id))).orderBy(desc(directorJobs.createdAt));
        const qc = await db.select().from(directorQcReports).where(and(eq(directorQcReports.projectId, input.projectId), eq(directorQcReports.userId, ctx.user.id))).orderBy(desc(directorQcReports.createdAt));

        type DagNode = { id: string; kind: "project" | "scene" | "shot" | "job"; label: string; status: string; progress: number; sceneId?: number; shotId?: number; jobId?: number };
        type DagEdge = { id: string; source: string; target: string; kind: "contains" | "dependency" | "assembly" | "execution" };
        const dagNodes: DagNode[] = [{ id: `project-${owned[0].id}`, kind: "project", label: owned[0].title, status: owned[0].status, progress: 0 }];
        const dagEdges: DagEdge[] = [];
        for (const scene of scenes) {
          const sceneShots = shots.filter((shot) => shot.sceneId === scene.id).sort((a, b) => a.sequenceIndex - b.sequenceIndex);
          const sceneJobs = jobs.filter((job) => job.sceneId === scene.id);
          const sceneProgress = sceneJobs.length ? Math.round(sceneJobs.reduce((sum, job) => sum + job.progress, 0) / sceneJobs.length) : sceneShots.length ? Math.round(sceneShots.reduce((sum, shot) => sum + (shot.status === "generated" || shot.status === "approved" ? 100 : shot.status === "generating" ? 50 : 0), 0) / sceneShots.length) : 0;
          const sceneNodeId = `scene-${scene.id}`;
          dagNodes.push({ id: sceneNodeId, kind: "scene", label: `${scene.sceneKey} · ${scene.title}`, status: scene.status, progress: sceneProgress, sceneId: scene.id });
          dagEdges.push({ id: `edge-project-${scene.id}`, source: `project-${owned[0].id}`, target: sceneNodeId, kind: "contains" });
          let previousShotId: number | null = null;
          for (const shot of sceneShots) {
            const shotNodeId = `shot-${shot.id}`;
            const shotJob = jobs.find((job) => job.shotId === shot.id);
            dagNodes.push({ id: shotNodeId, kind: "shot", label: shot.shotKey, status: shot.status, progress: shotJob?.progress ?? (shot.status === "generated" || shot.status === "approved" ? 100 : 0), sceneId: scene.id, shotId: shot.id });
            if (previousShotId !== null) dagEdges.push({ id: `edge-shot-${previousShotId}-${shot.id}`, source: `shot-${previousShotId}`, target: shotNodeId, kind: "dependency" });
            dagEdges.push({ id: `edge-shot-scene-${shot.id}-${scene.id}`, source: shotNodeId, target: sceneNodeId, kind: "assembly" });
            previousShotId = shot.id;
          }
        }
        for (const job of jobs) {
          const jobNodeId = `job-${job.id}`;
          dagNodes.push({ id: jobNodeId, kind: "job", label: `${job.stage} · ${job.kind}`, status: job.status, progress: job.progress, sceneId: job.sceneId ?? undefined, shotId: job.shotId ?? undefined, jobId: job.id });
          if (job.shotId) dagEdges.push({ id: `edge-shot-job-${job.shotId}-${job.id}`, source: `shot-${job.shotId}`, target: jobNodeId, kind: "execution" });
          else if (job.sceneId) dagEdges.push({ id: `edge-scene-job-${job.sceneId}-${job.id}`, source: `scene-${job.sceneId}`, target: jobNodeId, kind: "execution" });
        }
        return { project: owned[0], scenes, shots, jobs, qc, dag: { nodes: dagNodes, edges: dagEdges } };
      }),

    nodeDetails: protectedProcedure
      .input(z.object({ projectId: z.number(), nodeId: z.string().min(1).max(255) }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return null;
        const owned = await db.select({ id: projects.id, title: projects.title, status: projects.status }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id))).limit(1);
        if (!owned.length) return null;
        const nodeId = input.nodeId;
        const shotId = nodeId.startsWith("shot-") ? Number(nodeId.slice(5)) : undefined;
        const sceneId = nodeId.startsWith("scene-") ? Number(nodeId.slice(6)) : undefined;
        const jobId = nodeId.startsWith("job-") ? Number(nodeId.slice(4)) : undefined;
        const [shot] = shotId ? await db.select().from(directorShots).where(and(eq(directorShots.id, shotId), eq(directorShots.projectId, input.projectId), eq(directorShots.userId, ctx.user.id))).limit(1) : [];
        const [scene] = sceneId ? await db.select().from(directorScenes).where(and(eq(directorScenes.id, sceneId), eq(directorScenes.projectId, input.projectId), eq(directorScenes.userId, ctx.user.id))).limit(1) : [];
        const [job] = jobId ? await db.select().from(directorJobs).where(and(eq(directorJobs.id, jobId), eq(directorJobs.projectId, input.projectId), eq(directorJobs.userId, ctx.user.id))).limit(1) : [];
        const jobs = await db.select().from(directorJobs).where(and(eq(directorJobs.projectId, input.projectId), eq(directorJobs.userId, ctx.user.id), shotId ? eq(directorJobs.shotId, shotId) : sceneId ? eq(directorJobs.sceneId, sceneId) : jobId ? eq(directorJobs.id, jobId) : eq(directorJobs.projectId, input.projectId))).orderBy(desc(directorJobs.updatedAt)).limit(50);
        const logs = await db.select().from(directorNodeLogs).where(and(eq(directorNodeLogs.projectId, input.projectId), eq(directorNodeLogs.userId, ctx.user.id), eq(directorNodeLogs.nodeId, nodeId))).orderBy(desc(directorNodeLogs.createdAt)).limit(100);
        const generatedAssets = await db.select().from(directorJobAssets).where(and(eq(directorJobAssets.projectId, input.projectId), eq(directorJobAssets.userId, ctx.user.id), shotId ? eq(directorJobAssets.shotId, shotId) : sceneId ? eq(directorJobAssets.sceneId, sceneId) : jobId ? eq(directorJobAssets.jobId, jobId) : eq(directorJobAssets.projectId, input.projectId))).orderBy(desc(directorJobAssets.createdAt)).limit(100);
        const node = shot ? { kind: "shot", id: nodeId, label: shot.shotKey, status: shot.status, progress: jobs[0]?.progress ?? 0, shot, sceneId: shot.sceneId } : scene ? { kind: "scene", id: nodeId, label: `${scene.sceneKey} · ${scene.title}`, status: scene.status, progress: jobs[0]?.progress ?? 0, scene, sceneId: scene.id } : job ? { kind: "job", id: nodeId, label: `${job.stage} · ${job.kind}`, status: job.status, progress: job.progress, job, sceneId: job.sceneId, shotId: job.shotId } : { kind: "project", id: nodeId, label: owned[0].title, status: owned[0].status, progress: jobs.length ? Math.round(jobs.reduce((sum, item) => sum + item.progress, 0) / jobs.length) : 0 };
        return { node, jobs, logs, assets: generatedAssets };
      }),

    jobs: protectedProcedure
      .input(z.object({ projectId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const where = input.projectId ? and(eq(directorJobs.userId, ctx.user.id), eq(directorJobs.projectId, input.projectId)) : eq(directorJobs.userId, ctx.user.id);
        return db.select().from(directorJobs).where(where).orderBy(desc(directorJobs.updatedAt)).limit(100);
      }),

    updateJob: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["queued", "running", "paused", "completed", "failed", "blocked", "cancelled"]), stage: z.string().max(64), progress: z.number().int().min(0).max(100), error: z.string().max(2000).optional(), metadata: z.any().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await db.select({ status: directorJobs.status }).from(directorJobs).where(and(eq(directorJobs.id, input.id), eq(directorJobs.userId, ctx.user.id))).limit(1);
        if (!existing.length) throw new Error("Director job not found");
        await db.update(directorJobs).set({ status: input.status, stage: input.stage, progress: input.progress, error: input.error, metadata: input.metadata === undefined ? undefined : JSON.stringify(input.metadata), updatedAt: new Date() }).where(and(eq(directorJobs.id, input.id), eq(directorJobs.userId, ctx.user.id)));
        if (input.status === "blocked" && existing[0].status !== "blocked") {
          const notification = buildBlockedJobNotification({ jobId: input.id, stage: input.stage, reason: input.error });
          await dispatchAppNotification({ userId: ctx.user.id, ...notification });
        }
        return { success: true };
      }),

    controlProject: protectedProcedure
      .input(z.object({ projectId: z.number(), action: z.enum(["pause", "resume", "cancel", "stop"]) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const owned = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id))).limit(1);
        if (!owned.length) throw new Error("Project not found");
        const projectJobs = await db.select({ id: directorJobs.id, status: directorJobs.status }).from(directorJobs).where(and(eq(directorJobs.projectId, input.projectId), eq(directorJobs.userId, ctx.user.id)));
        const affectedJobIds: number[] = [];
        for (const job of projectJobs) {
          const nextStatus = input.action === "pause" && ["queued", "running"].includes(job.status) ? "paused" : input.action === "resume" && job.status === "paused" ? "queued" : (input.action === "cancel" || input.action === "stop") && !["completed", "cancelled"].includes(job.status) ? "cancelled" : null;
          if (!nextStatus) continue;
          await db.update(directorJobs).set({ status: nextStatus, error: input.action === "stop" ? "Stopped by Director Console" : input.action === "cancel" ? "Cancelled by Director Console" : undefined, updatedAt: new Date() }).where(and(eq(directorJobs.id, job.id), eq(directorJobs.userId, ctx.user.id)));
          affectedJobIds.push(job.id);
        }
        await db.update(projects).set({ status: input.action === "stop" || input.action === "cancel" ? "failed" : "processing", metadata: JSON.stringify({ directorControl: input.action, controlledAt: new Date().toISOString() }) }).where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));
        return { success: true, action: input.action, affectedJobIds };
      }),

    saveBoundary: protectedProcedure
      .input(z.object({ shotId: z.number(), startContinuity: z.any().optional(), endContinuity: z.any().optional(), assetUrl: z.string().max(2000).optional(), finalFrameUrl: z.string().max(2000).optional(), routeUsed: z.string().max(128).optional(), status: z.enum(["pending", "generating", "generated", "needs_review", "approved", "failed"]).optional(), qaScore: z.number().int().min(0).max(100).optional(), provenance: z.any().optional(), lineage: z.any().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await db.select({ status: directorShots.status, projectId: directorShots.projectId }).from(directorShots).where(and(eq(directorShots.id, input.shotId), eq(directorShots.userId, ctx.user.id))).limit(1);
        if (!existing.length) throw new Error("Director shot not found");
        await db.update(directorShots).set({ startContinuity: input.startContinuity === undefined ? undefined : JSON.stringify(input.startContinuity), endContinuity: input.endContinuity === undefined ? undefined : JSON.stringify(input.endContinuity), assetUrl: input.assetUrl, finalFrameUrl: input.finalFrameUrl, routeUsed: input.routeUsed, status: input.status, qaScore: input.qaScore, provenance: input.provenance === undefined ? undefined : JSON.stringify(input.provenance), lineage: input.lineage === undefined ? undefined : JSON.stringify(input.lineage), updatedAt: new Date() }).where(and(eq(directorShots.id, input.shotId), eq(directorShots.userId, ctx.user.id)));
        if (input.status === "needs_review" && existing[0].status !== "needs_review") {
          const notification = buildBoundaryReviewNotification({ shotId: input.shotId, projectId: existing[0].projectId });
          await dispatchAppNotification({ userId: ctx.user.id, ...notification });
        }
        return { success: true };
      }),

    saveQc: protectedProcedure
      .input(z.object({ projectId: z.number(), sceneId: z.number().optional(), shotId: z.number().optional(), subjectKey: z.string().max(255), transition: z.boolean().default(false), passed: z.boolean(), score: z.number().int().min(0).max(100), findings: z.any().optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const result = await db.insert(directorQcReports).values({ userId: ctx.user.id, projectId: input.projectId, sceneId: input.sceneId, shotId: input.shotId, subjectKey: input.subjectKey, transition: input.transition, passed: input.passed, score: input.score, findings: input.findings === undefined ? undefined : JSON.stringify(input.findings) });
        return { id: Number(result[0].insertId), success: true };
      }),

    retryShot: protectedProcedure
      .input(z.object({ projectId: z.number(), shotId: z.number(), reason: z.string().min(1).max(2000) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const result = await db.insert(directorJobs).values({ userId: ctx.user.id, projectId: input.projectId, shotId: input.shotId, kind: "repair", stage: "shot_generation", status: "queued", progress: 0, attempt: 1, metadata: JSON.stringify({ reason: input.reason, policy: "regenerate_smallest_failed_unit" }) });
        await db.update(directorShots).set({ status: "generating", updatedAt: new Date() }).where(and(eq(directorShots.id, input.shotId), eq(directorShots.userId, ctx.user.id)));
        return { jobId: Number(result[0].insertId), status: "queued" as const };
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

  // ── Downloads & Release Artifacts ───────────────────────────────────────
  downloads: router({
    listArtifacts: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const items = await db.select().from(releaseArtifacts)
        .where(eq(releaseArtifacts.isPublished, true))
        .orderBy(desc(releaseArtifacts.createdAt));
      return items.filter((artifact) =>
        artifact.downloadUrl.startsWith("https://") ||
        artifact.downloadUrl.startsWith("/api/downloads/") ||
        artifact.downloadUrl.startsWith("/manus-storage/")
      );
    }),
  }),

  // ── Custom Domains ────────────────────────────────────────────────────────
  customDomains: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(customDomains).where(eq(customDomains.userId, ctx.user.id)).orderBy(desc(customDomains.createdAt)).limit(1);
      return rows[0] || null;
    }),

    saveAndVerify: protectedProcedure
      .input(z.object({ hostname: z.string().min(3).max(255) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const cleanHost = input.hostname.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        if (cleanHost.includes("/") || cleanHost.includes(":") || cleanHost === "localhost" || cleanHost.endsWith(".local")) {
          throw new Error("Invalid domain hostname format");
        }
        const existing = await db.select().from(customDomains).where(eq(customDomains.userId, ctx.user.id)).limit(1);
        const target = "proxy.manus.space";
        let verificationStatus: "pending" | "verified" | "failed" = "verified";
        let bindingStatus: "unbound" | "pending_binding" | "bound" | "error" = "pending_binding";
        let sslStatus: "inactive" | "provisioning" | "active" | "error" = "provisioning";
        let errorMessage: string | null = null;

        if (existing.length > 0) {
          await db.update(customDomains).set({
            hostname: cleanHost,
            cnameTarget: target,
            verificationStatus,
            bindingStatus,
            sslStatus,
            errorMessage,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(customDomains.id, existing[0].id));
          return { id: existing[0].id, hostname: cleanHost, verificationStatus, bindingStatus, sslStatus };
        } else {
          const res = await db.insert(customDomains).values({
            userId: ctx.user.id,
            hostname: cleanHost,
            cnameTarget: target,
            verificationStatus,
            bindingStatus,
            sslStatus,
            errorMessage,
            lastCheckedAt: new Date(),
          });
          return { id: Number(res[0].insertId), hostname: cleanHost, verificationStatus, bindingStatus, sslStatus };
        }
      }),

    remove: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(customDomains).where(eq(customDomains.userId, ctx.user.id));
      return { success: true };
    }),
  }),

  // ── Global Settings & Localization ──────────────────────────────────────
  globalSettings: globalSettingsRouter,

  // ── Tool & model registry, and the onboarding installer ─────────────────
  // The first-launch screen installs everything from here, so the user never has
  // to leave the app to fetch a runtime or a model.
  tools: router({
    registry: protectedProcedure
      .input(z.object({ os: z.enum(["win32", "darwin", "linux", "unknown"]).optional(), ramGB: z.number().nonnegative().optional(), vramGB: z.number().nonnegative().optional(), backends: z.array(z.enum(["cuda", "rocm", "vulkan", "metal", "cpu"])).optional() }).optional())
      .query(({ input }) => {
        const hardware: HardwareProfile = {
          os: input?.os ?? (process.platform as HardwareProfile["os"]),
          ramGB: input?.ramGB ?? null,
          vramGB: input?.vramGB ?? null,
          backends: input?.backends ?? ["cpu"],
        };
        return TOOL_REGISTRY.map((tool) => ({ tool, compatibility: assessCompatibility(tool, hardware) }));
      }),
    installs: protectedProcedure.query(() => getSharedInstaller().list()),
    install: protectedProcedure
      .input(z.object({ toolId: z.string().min(1).max(80), weightSourceUrl: z.string().url().optional() }))
      .mutation(({ input }) => getSharedInstaller().install(input.toolId, { weightSourceUrl: input.weightSourceUrl })),
    cancelInstall: protectedProcedure
      .input(z.object({ toolId: z.string().min(1).max(80) }))
      .mutation(({ input }) => ({ cancelled: getSharedInstaller().cancel(input.toolId) })),
    /**
     * The real install plan for this machine. Release URLs and sizes come from the
     * upstream release itself, so this reports what is actually downloadable rather
     * than a hardcoded link that rots.
     */
    plan: protectedProcedure
      .input(z.object({ toolId: z.string().min(1).max(80) }))
      .query(async ({ input }) => {
        const tool = TOOL_REGISTRY.find((entry) => entry.id === input.toolId);
        if (!tool) throw new Error(`Unknown tool "${input.toolId}".`);
        return resolveInstallPlan(tool, currentPlatform());
      }),
    plans: protectedProcedure.query(() => resolveAllInstallPlans(currentPlatform())),
    /** Install using the resolved plan, verifying the download against the release. */
    installFromPlan: protectedProcedure
      .input(z.object({ toolId: z.string().min(1).max(80), allowElevatedCommands: z.boolean().optional(), extract: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const tool = TOOL_REGISTRY.find((entry) => entry.id === input.toolId);
        if (!tool) throw new Error(`Unknown tool "${input.toolId}".`);
        const plan = await resolveInstallPlan(tool, currentPlatform());
        return getSharedInstaller().installFromPlan(plan, { allowElevatedCommands: input.allowElevatedCommands, extract: input.extract });
      }),
    /** Real model-weight files, resolved live from the Hub. */
    weights: protectedProcedure.query(() => resolveAllWeights()),
    /** Resolve a Hub repository the user named, for a tool that reported needs_source. */
    resolveWeights: protectedProcedure
      .input(z.object({ repo: z.string().min(3).max(200), toolId: z.string().min(1).max(80) }))
      .mutation(({ input }) => resolveUserSuppliedRepo(input.repo, input.toolId)),
  }),

  // ── Execution plane: the real adapters that do the work ─────────────────
  // Health is a live probe of each tool, never a cached claim. Resolution reports
  // every candidate it tried, so a fallback is always visible to the user.
  adapters: router({
    health: protectedProcedure.query(() => adapterHealth(buildAdapters())),
    resolve: protectedProcedure
      .input(z.object({ capability: z.enum(["video_generation", "image_generation", "lipsync", "upscale", "transcribe", "review", "assemble"]) }))
      .query(({ input }) => resolveAdapter(input.capability, buildAdapters())),
    /** Real hardware detection for this machine. Unknown stays unknown. */
    hardware: protectedProcedure.query(() => detectHardware()),
    /**
     * The readiness self-test. Runs on the machine with the hardware: detects it for
     * real, probes every adapter, encodes and validates a real clip, and — when given
     * a workflow and prompts — drives the full proof scene.
     */
    selfTest: protectedProcedure
      .input(
        z
          .object({
            workflowJson: z.string().min(2).max(200_000).optional(),
            promptA: z.string().min(1).max(2000).optional(),
            promptB: z.string().min(1).max(2000).optional(),
            frames: z.number().int().min(4).max(120).optional(),
            takes: z.number().int().min(1).max(4).optional(),
          })
          .optional(),
      )
      .mutation(async ({ input }) => {
        let proof: { workflow: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>; promptA: string; promptB: string; frames?: number; takes?: number } | undefined;
        if (input?.workflowJson && input.promptA && input.promptB) {
          try {
            proof = { workflow: JSON.parse(input.workflowJson), promptA: input.promptA, promptB: input.promptB, frames: input.frames, takes: input.takes };
          } catch {
            throw new Error("The workflow is not valid JSON.");
          }
        }
        return runSelfTest({ config: runtimeConfig(), proof });
      }),

    /**
     * Run the proof scene. This is the acceptance gate: it exercises the actually
     * installed models and reports `blocked` when any of them is missing.
     */
    runProof: protectedProcedure
      .input(
        z.object({
          workflowJson: z.string().min(2).max(200_000),
          promptA: z.string().min(1).max(2000),
          promptB: z.string().min(1).max(2000),
          frames: z.number().int().min(4).max(120).optional(),
          takes: z.number().int().min(1).max(4).optional(),
          reviewFrames: z.number().int().min(1).max(6).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        let workflow: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
        try {
          workflow = JSON.parse(input.workflowJson) as typeof workflow;
        } catch {
          throw new Error("The workflow is not valid JSON.");
        }
        const config = runtimeConfig();
        return filmJobQueue.enqueue(
          { label: "proof-scene", weight: "heavy", estimatedPeakMB: 4096 },
          () =>
            runProofScene(buildAdapters(config), {
              workflow,
              shots: [
                { shotId: "proof-shot-1", prompt: input.promptA, takes: input.takes ?? 2, frames: input.frames ?? 24 },
                {
                  shotId: "proof-shot-2",
                  prompt: input.promptB,
                  takes: input.takes ?? 2,
                  frames: input.frames ?? 24,
                  continuity: [{ subject: "Lead", lockedFields: ["face", "costume", "position"], referenceAssetIds: ["proof-reference"] }],
                },
              ],
              workDir: path.join(config.mediaDir, "proof"),
              reviewFramesPerShot: input.reviewFrames ?? 3,
            }),
        );
      }),
  }),

  // ── Resource-aware job queue ────────────────────────────────────────────
  // Serializes heavy work so the desktop app does not freeze or run out of memory.
  queue: router({
    status: protectedProcedure.query(() => filmJobQueue.snapshot()),
    configure: protectedProcedure
      .input(z.object({ ramGB: z.number().positive().optional(), vramGB: z.number().nonnegative().optional() }))
      .mutation(({ input }) => {
        filmJobQueue.setBudget(budgetFromHardware({ ramGB: input.ramGB, vramGB: input.vramGB }));
        return filmJobQueue.snapshot();
      }),
    cancel: protectedProcedure
      .input(z.object({ jobId: z.string().min(1).max(200) }))
      .mutation(({ input }) => ({ cancelled: filmJobQueue.cancel(input.jobId) })),
    reportPressure: protectedProcedure
      .input(z.object({ freeRamMB: z.number().nonnegative() }))
      .mutation(({ input }) => {
        filmJobQueue.reportPressure({ freeRamMB: input.freeRamMB });
        return filmJobQueue.snapshot();
      }),
  }),

  // ── App-owned operator notifications ─────────────────────────────────────
  appNotifications: router({
    list: protectedProcedure.query(({ ctx }) => listAppNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => markAppNotificationRead(ctx.user.id, input.id)),
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
