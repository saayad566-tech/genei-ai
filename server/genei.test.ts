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
    expect(result.models[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      supportsAndroid: true,
      supportsOnDevice: expect.any(Boolean),
      purposes: expect.any(Array),
    }));
  });

  it("rejects empty model prompts before invoking the provider", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.ai.generateText({ prompt: "", purpose: "chat" })).rejects.toThrow();
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
  it("returns no executable or archive URL until a published artifact exists", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.downloads.listArtifacts();
    expect(result).toEqual([]);
  });
});
