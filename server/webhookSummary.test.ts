import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./webhookProcessor", () => ({ processVerifiedWebhookEvent: vi.fn() }));

import { getDb } from "./db";
import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 77, openId: "summary-user", name: "Summary Tester", email: "summary@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function groupedDatabase(rows: Array<{ status: string; count: number }>) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn(async () => rows),
  };
  return { select: vi.fn(() => query) };
}

describe("webhook receipt summary procedure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns authoritative totals for the authenticated workspace, including failed events beyond the visible page", async () => {
    const db = groupedDatabase([
      { status: "failed", count: 127 },
      { status: "applied", count: 240 },
      { status: "received", count: 3 },
      { status: "ignored", count: 5 },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await appRouter.createCaller(context()).globalSettings.getWebhookReceiptSummary();

    expect(result).toEqual({ available: true, total: 375, failed: 127, received: 3, applied: 240, ignored: 5 });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns a safe zero summary when the database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(undefined);

    await expect(appRouter.createCaller(context()).globalSettings.getWebhookReceiptSummary()).resolves.toEqual({ available: false, total: 0, failed: 0, received: 0, applied: 0, ignored: 0 });
  });
});
