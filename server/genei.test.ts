import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: Array<{ name: string; options: Record<string, unknown> }> } {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-genei",
    email: "creator@genei.ai",
    name: "Genei Creator",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("auth", () => {
  it("me returns null for unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("me returns user for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("creator@genei.ai");
  });

  it("logout clears the session cookie", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

describe("stats", () => {
  it("overview returns zero counts when DB is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.stats.overview();
    expect(result).toMatchObject({
      totalAssets: expect.any(Number),
      totalProjects: expect.any(Number),
      totalApiKeys: expect.any(Number),
      totalMessages: expect.any(Number),
    });
  });
});

describe("projects", () => {
  it("list returns array when DB is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("assets", () => {
  it("list returns array when DB is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.assets.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("apiKeys", () => {
  it("list returns array when DB is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.apiKeys.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("runners", () => {
  it("list returns an array for an authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.runners.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("exports", () => {
  it("list returns an array for an authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.exports.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("chat", () => {
  it("history returns array when DB is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.history({});
    expect(Array.isArray(result)).toBe(true);
  });
});


describe("ai model gateway", () => {
  it("returns a capability catalog that is safe to expose to Android clients", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ai.capabilities();

    expect(Array.isArray(result.models)).toBe(true);
    expect(["live", "fallback"]).toContain(result.source);

    // Every model that is returned must be safely shaped for the client.
    for (const model of result.models) {
      expect(model).toEqual(expect.objectContaining({
        id: expect.any(String),
        supportsAndroid: true,
        supportsOnDevice: expect.any(Boolean),
        purposes: expect.any(Array),
      }));
    }

    // The gateway must never fabricate a model to fill the catalog. Nothing is
    // configured in this environment, so no hardcoded default may appear - the
    // user chooses the model, the platform does not choose for them.
    expect(result.models.map((model) => model.id)).not.toContain("gemini-2.5-flash");
  });

  it("refuses to generate when no model is selected instead of using a built-in default", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // No provider is configured here, so there is no model to run. The honest
    // outcome is a refusal that tells the user to pick one.
    await expect(
      caller.ai.generateText({ prompt: "hello", purpose: "chat" }),
    ).rejects.toThrow(/No model is selected/);
  });

  it("rejects empty model prompts before invoking the provider", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.ai.generateText({ prompt: "", purpose: "chat" })).rejects.toThrow();
  });
});

describe("resource-aware queue wiring", () => {
  it("exposes a queue snapshot the desktop client can display", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const snapshot = await caller.queue.status();

    expect(snapshot.budget.maxConcurrentHeavyJobs).toBe(1);
    expect(Array.isArray(snapshot.running)).toBe(true);
    expect(Array.isArray(snapshot.queued)).toBe(true);
    expect(snapshot.reservedMB).toBeGreaterThanOrEqual(0);
    expect(typeof snapshot.paused).toBe("boolean");
  });

  it("reconfigures the budget from real hardware figures", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const snapshot = await caller.queue.configure({ ramGB: 16, vramGB: 8 });

    expect(snapshot.budget.ramBudgetMB).toBe(Math.round(16 * 1024 * 0.6));
    expect(snapshot.budget.vramBudgetMB).toBe(8192);
  });

  it("pauses admission when the machine reports memory pressure", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const snapshot = await caller.queue.reportPressure({ freeRamMB: 10 });

    expect(snapshot.paused).toBe(true);
    expect(snapshot.pauseReason).toMatch(/memory is free/i);

    await caller.queue.configure({ ramGB: 16, vramGB: 8 });
    await caller.queue.reportPressure({ freeRamMB: 8000 });
    expect((await caller.queue.status()).paused).toBe(false);
  });
});

describe("execution plane wiring", () => {
  it("reports live health for every adapter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const health = await caller.adapters.health();

    expect(Array.isArray(health)).toBe(true);
    expect(health.length).toBeGreaterThanOrEqual(5);
    for (const entry of health) {
      // Never ready without a real probe: in this environment nothing is installed.
      expect(["ready", "degraded", "stopped", "not_installed", "failed", "needs_source", "unsupported"]).toContain(entry.state);
      expect(entry.message.length).toBeGreaterThan(0);
      expect(entry.toolId.length).toBeGreaterThan(0);
    }
  });

  it("tells the caller exactly why no video adapter is available", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const resolution = await caller.adapters.resolve({ capability: "video_generation" });

    expect(resolution.capability).toBe("video_generation");
    expect(resolution.adapterId).toBeNull();
    expect(resolution.considered.length).toBeGreaterThan(0);
    expect(resolution.considered[0].adapterId).toBe("comfyui");
    expect(resolution.considered[0].message).toMatch(/reachable|not found/i);
  });

  it("rejects a malformed workflow rather than passing it to the renderer", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.adapters.runProof({ workflowJson: "{not json", promptA: "a", promptB: "b" }),
    ).rejects.toThrow(/not valid JSON/i);
  });
});

describe("install plan and weight wiring", () => {
  it("resolves a real install plan for a tool", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const plan = await caller.tools.plan({ toolId: "video2x" });

    expect(plan.toolId).toBe("video2x");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(["github-release", "static-fallback", "none"]).toContain(plan.origin);
    // Whatever route it took, the reason must be recorded.
    const explained = plan.notes.length > 0 || plan.steps[0].kind === "archive" || plan.steps[0].kind === "git";
    expect(explained).toBe(true);
  }, 30_000);

  it("resolves a plan for every registered tool without inventing one", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const plans = await caller.tools.plans();
    expect(plans.length).toBeGreaterThan(5);
    for (const plan of plans) expect(plan.steps.length).toBeGreaterThan(0);
  }, 40_000);

  it("rejects an unknown tool instead of returning an empty plan", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tools.plan({ toolId: "no-such-tool" })).rejects.toThrow(/Unknown tool/);
  });

  it("reports the weight catalogue honestly, with an error when the Hub is unreachable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const weights = await caller.tools.weights();
    expect(weights.length).toBeGreaterThan(0);
    for (const entry of weights) {
      // Either real files, or a stated reason. Never a silent empty success.
      expect(entry.files.length > 0 || Boolean(entry.error)).toBe(true);
    }
  }, 30_000);

  it("refuses a malformed weights repository", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tools.resolveWeights({ repo: "nonsense", toolId: "wan22" });
    expect(result.error).toMatch(/owner\/name/);
  });
});

describe("live context gathering wiring", () => {
  it("refuses a private address instead of fetching it", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const { result, grounding } = await caller.director.gatherContext({ url: "http://127.0.0.1:3000/admin" });

    expect(result.status).toBe("unsupported");
    expect(grounding).toMatch(/No live context is available/);
  });

  it("asks for an input rather than guessing what to look up", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const { result } = await caller.director.gatherContext({});
    expect(result.status).toBe("unsupported");
  });
});


describe("assets importRemote", () => {
  it("rejects non-URL remote asset inputs before network access", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.assets.importRemote({
      name: "test",
      remoteUrl: "not-a-url",
      type: "image",
    })).rejects.toThrow();
  });
});

describe("director orchestration controls", () => {
  it("rejects unknown control actions before database mutation", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.director.controlProject({ projectId: 1, action: "delete-all" as never })).rejects.toThrow();
    await expect(caller.director.controlProject({ projectId: 1, action: "cancel" })).rejects.toThrow();
  });
});

describe("webhook notification history", () => {
  it("returns a user-scoped array with validated filters when the database is unavailable", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.globalSettings.getWebhookReceipts({
      search: "runway",
      status: "applied",
      provider: "runway",
      limit: 100,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects invalid history limits", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.globalSettings.getWebhookReceipts({ limit: 0 })).rejects.toThrow();
  });
});


describe("downloads", () => {
  it("returns only published artifacts with real safe download paths", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.downloads.listArtifacts();
    expect(result.every((artifact) =>
      artifact.downloadUrl.startsWith("https://") ||
      artifact.downloadUrl.startsWith("/api/downloads/") ||
      artifact.downloadUrl.startsWith("/manus-storage/")
    )).toBe(true);
    expect(result.some((artifact) => artifact.downloadUrl.includes("#"))).toBe(false);
  });
});
