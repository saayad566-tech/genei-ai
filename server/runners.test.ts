import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "runner-test-user",
      name: "Runner Tester",
      email: "runner@example.com",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function fakeDatabase() {
  const insert = vi.fn(() => ({ values: vi.fn(async () => [{ insertId: 7 }]) }));
  const selectResult = [{ id: 7, status: "offline" }];
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => selectResult),
    orderBy: vi.fn(async () => []),
  }));
  const update = vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn(async () => []),
  }));
  return { insert, select, update };
}

describe("BYOH runner procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pairs a workstation and returns a one-time token", async () => {
    const db = fakeDatabase();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());

    const result = await caller.runners.pair({ name: "Studio GPU", platform: "Windows" });

    expect(result.id).toBe(7);
    expect(result.token).toMatch(/^genei_[a-f0-9]+$/);
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("accepts a heartbeat with hardware metadata and marks the runner paired", async () => {
    const db = fakeDatabase();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());

    const result = await caller.runners.heartbeat({
      token: `genei_${"a".repeat(48)}`,
      platform: "Linux 6.8",
      capabilities: ["ffmpeg", "gpu-cuda"],
      hardware: { cpu_count: 16, ram_mb: 65536, gpu_count: 1, gpus: [{ name: "Test GPU", vram_mb: "24576" }], platform: "Linux", tools: { ffmpeg: true, docker: true } },
    });

    expect(result.ok).toBe(true);
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("revokes a runner for the authenticated owner", async () => {
    const db = fakeDatabase();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());

    const result = await caller.runners.revoke({ id: 7 });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledOnce();
  });
});
