import { and, desc, eq, isNull } from "drizzle-orm";
import { appNotifications } from "../drizzle/schema";
import { getDb } from "./db";

export type AppNotificationType = "director_job_blocked" | "continuity_review_required";

export function buildBlockedJobNotification(input: { jobId: number; stage: string; reason?: string | null }) {
  return {
    type: "director_job_blocked" as const,
    title: "Director job needs attention",
    message: `Job #${input.jobId} is blocked at ${input.stage}.${input.reason ? ` ${input.reason}` : " Open the Director Console to review the next step."}`,
    entityId: String(input.jobId),
  };
}

export function buildBoundaryReviewNotification(input: { shotId: number; projectId?: number | null }) {
  return {
    type: "continuity_review_required" as const,
    title: "Continuity review required",
    message: `Shot #${input.shotId} needs a boundary review before the Director can continue. Open the Director Console to approve or edit the transition.${input.projectId ? ` Project #${input.projectId}.` : ""}`,
    entityId: String(input.shotId),
  };
}

export async function dispatchAppNotification(input: { userId: number; type: AppNotificationType; title: string; message: string; entityId?: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(appNotifications).values({ userId: input.userId, type: input.type, title: input.title, message: input.message, entityId: input.entityId });
  return true;
}

export async function listAppNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appNotifications).where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt))).orderBy(desc(appNotifications.createdAt)).limit(50);
}

export async function markAppNotificationRead(userId: number, id: number) {
  const db = await getDb();
  if (!db) return false;
  await db.update(appNotifications).set({ readAt: new Date() }).where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId)));
  return true;
}
