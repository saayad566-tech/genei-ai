import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./webhookProcessor", () => ({ processVerifiedWebhookEvent: vi.fn() }));

import { getDb } from "./db";
import { processVerifiedWebhookEvent } from "./webhookProcessor";
import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 42, openId: "retry-test-user", name: "Retry Tester", email: "retry@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function fakeDatabase(selectResponses: unknown[][]) {
  const select = vi.fn(() => {
    const response = selectResponses.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => response),
    };
  });
  return { select };
}

describe("webhook retry procedure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replays a failed receipt using the authenticated user's stored payload", async () => {
    const db = fakeDatabase([
      [{ id: 9, userId: 42, provider: "runway", externalTaskId: "task-9", eventType: "completed", payload: JSON.stringify({ id: "task-9", status: "completed" }), status: "failed" }],
      [],
    ]);
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(processVerifiedWebhookEvent).mockResolvedValue({ receiptId: 10, receiptStatus: "applied", externalTaskId: "task-9", eventType: "completed" });

    const result = await appRouter.createCaller(context()).globalSettings.retryWebhookReceipt({ id: 9 });

    expect(result).toEqual({ success: true, status: "applied", receiptId: 10, error: undefined });
    expect(processVerifiedWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ provider: "runway", expectedUserId: 42, retryOfReceiptId: 9, rawBody: JSON.stringify({ id: "task-9", status: "completed" }) }));
  });

  it("refuses to retry an already-applied receipt", async () => {
    const db = fakeDatabase([[{ id: 11, userId: 42, provider: "pika", payload: "{}", status: "applied" }], []]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    await expect(appRouter.createCaller(context()).globalSettings.retryWebhookReceipt({ id: 11 })).rejects.toThrow("Only failed webhook events can be retried");
    expect(processVerifiedWebhookEvent).not.toHaveBeenCalled();
  });
});
