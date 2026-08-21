import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { buildBlockedJobNotification, buildBoundaryReviewNotification } from "./appNotifications";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 9,
    openId: "notification-test-user",
    email: "notifications@genei.ai",
    name: "Notification Tester",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("app-owned Director notifications", () => {
  it("builds an actionable blocked-job notification", () => {
    expect(buildBlockedJobNotification({ jobId: 42, stage: "continuity_qc", reason: "Boundary mismatch" })).toEqual({
      type: "director_job_blocked",
      title: "Director job needs attention",
      message: "Job #42 is blocked at continuity_qc. Boundary mismatch",
      entityId: "42",
    });
  });

  it("builds an actionable continuity review notification", () => {
    expect(buildBoundaryReviewNotification({ shotId: 7, projectId: 3 })).toMatchObject({
      type: "continuity_review_required",
      title: "Continuity review required",
      entityId: "7",
    });
  });

  it("keeps notification queries protected and returns safe fallbacks without a database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    expect(await caller.appNotifications.list()).toEqual([]);
    expect(await caller.appNotifications.markRead({ id: 1 })).toBe(true);
  });
});
