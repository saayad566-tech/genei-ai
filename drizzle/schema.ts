import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(), // music, video, image, app, website, voice
  description: text("description"),
  thumbnail: text("thumbnail"),
  status: mysqlEnum("status", ["draft", "processing", "completed", "failed"]).default("draft").notNull(),
  metadata: text("metadata"), // JSON string for type-specific data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(), // image, audio, video, document
  mimeType: varchar("mimeType", { length: 128 }),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  size: bigint("size", { mode: "number" }).default(0),
  prompt: text("prompt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(), // openai, suno, runway, etc.
  label: varchar("label", { length: 128 }),
  encryptedKey: text("encryptedKey").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

export const byohRunners = mysqlTable("byoh_runners", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  platform: varchar("platform", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["paired", "offline", "revoked"]).default("paired").notNull(),
  capabilities: text("capabilities"),
  pairingTokenHash: varchar("pairingTokenHash", { length: 128 }).notNull(),
  lastHeartbeat: timestamp("lastHeartbeat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ByohRunner = typeof byohRunners.$inferSelect;
export type InsertByohRunner = typeof byohRunners.$inferInsert;

export const runnerLogs = mysqlTable("runner_logs", {
  id: int("id").autoincrement().primaryKey(),
  runnerId: int("runnerId").notNull(),
  level: mysqlEnum("level", ["info", "warn", "error", "heartbeat"]).default("info").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RunnerLog = typeof runnerLogs.$inferSelect;
export type InsertRunnerLog = typeof runnerLogs.$inferInsert;

export const exportJobs = mysqlTable("export_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  format: varchar("format", { length: 64 }).notNull(),
  preset: varchar("preset", { length: 64 }).notNull(),
  publishTarget: varchar("publishTarget", { length: 64 }),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).default("queued").notNull(),
  outputUrl: text("outputUrl"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExportJob = typeof exportJobs.$inferSelect;
export type InsertExportJob = typeof exportJobs.$inferInsert;

export const releaseArtifacts = mysqlTable("release_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 64 }).notNull(),
  platform: varchar("platform", { length: 64 }).notNull(), // win-x64, source-zip, android-apk, etc.
  fileSize: varchar("fileSize", { length: 64 }).notNull(),
  sha256: varchar("sha256", { length: 128 }).notNull(),
  downloadUrl: text("downloadUrl").notNull(),
  signingState: varchar("signingState", { length: 64 }).default("unsigned").notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReleaseArtifact = typeof releaseArtifacts.$inferSelect;
export type InsertReleaseArtifact = typeof releaseArtifacts.$inferInsert;

export const customDomains = mysqlTable("custom_domains", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  cnameTarget: varchar("cnameTarget", { length: 255 }).notNull(),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "failed"]).default("pending").notNull(),
  bindingStatus: mysqlEnum("bindingStatus", ["unbound", "pending_binding", "bound", "error"]).default("unbound").notNull(),
  sslStatus: mysqlEnum("sslStatus", ["inactive", "provisioning", "active", "error"]).default("inactive").notNull(),
  errorMessage: text("errorMessage"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomDomain = typeof customDomains.$inferSelect;
export type InsertCustomDomain = typeof customDomains.$inferInsert;

export const directorScenes = mysqlTable("director_scenes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneKey: varchar("sceneKey", { length: 128 }).notNull(),
  sceneIndex: int("sceneIndex").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective"),
  location: varchar("location", { length: 255 }),
  timeOfDay: varchar("timeOfDay", { length: 64 }),
  status: mysqlEnum("status", ["pending", "generating", "stitched", "needs_review", "completed", "failed"]).default("pending").notNull(),
  contract: text("contract"),
  startContinuity: text("startContinuity"),
  endContinuity: text("endContinuity"),
  finalVideoUrl: text("finalVideoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DirectorScene = typeof directorScenes.$inferSelect;
export type InsertDirectorScene = typeof directorScenes.$inferInsert;

export const directorShots = mysqlTable("director_shots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneId: int("sceneId").notNull(),
  shotKey: varchar("shotKey", { length: 128 }).notNull(),
  sequenceIndex: int("sequenceIndex").notNull(),
  prompt: text("prompt").notNull(),
  status: mysqlEnum("status", ["pending", "generating", "generated", "needs_review", "approved", "failed"]).default("pending").notNull(),
  contract: text("contract"),
  startContinuity: text("startContinuity"),
  endContinuity: text("endContinuity"),
  provenance: text("provenance"),
  lineage: text("lineage"),
  assetUrl: text("assetUrl"),
  finalFrameUrl: text("finalFrameUrl"),
  routeUsed: varchar("routeUsed", { length: 128 }),
  qaScore: int("qaScore").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DirectorShot = typeof directorShots.$inferSelect;
export type InsertDirectorShot = typeof directorShots.$inferInsert;

export const directorJobs = mysqlTable("director_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneId: int("sceneId"),
  shotId: int("shotId"),
  kind: varchar("kind", { length: 64 }).notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["queued", "running", "paused", "completed", "failed", "blocked", "cancelled"]).default("queued").notNull(),
  progress: int("progress").default(0).notNull(),
  attempt: int("attempt").default(0).notNull(),
  error: text("error"),
  metadata: text("metadata"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DirectorJob = typeof directorJobs.$inferSelect;
export type InsertDirectorJob = typeof directorJobs.$inferInsert;

export const directorQcReports = mysqlTable("director_qc_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneId: int("sceneId"),
  shotId: int("shotId"),
  subjectKey: varchar("subjectKey", { length: 255 }).notNull(),
  transition: boolean("transition").default(false).notNull(),
  passed: boolean("passed").default(false).notNull(),
  score: int("score").default(0).notNull(),
  findings: text("findings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DirectorQcReport = typeof directorQcReports.$inferSelect;
export type InsertDirectorQcReport = typeof directorQcReports.$inferInsert;

export const workflowGraphs = mysqlTable("workflow_graphs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  nodes: text("nodes").notNull(),
  edges: text("edges").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowGraph = typeof workflowGraphs.$inferSelect;
export type InsertWorkflowGraph = typeof workflowGraphs.$inferInsert;

export const directorNodeLogs = mysqlTable("director_node_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneId: int("sceneId"),
  shotId: int("shotId"),
  jobId: int("jobId"),
  nodeId: varchar("nodeId", { length: 255 }).notNull(),
  level: mysqlEnum("level", ["info", "warning", "error"]).default("info").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DirectorNodeLog = typeof directorNodeLogs.$inferSelect;
export type InsertDirectorNodeLog = typeof directorNodeLogs.$inferInsert;

export const directorJobAssets = mysqlTable("director_job_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId").notNull(),
  sceneId: int("sceneId"),
  shotId: int("shotId"),
  jobId: int("jobId"),
  kind: varchar("kind", { length: 64 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  sizeBytes: bigint("sizeBytes", { mode: "number" }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DirectorJobAsset = typeof directorJobAssets.$inferSelect;
export type InsertDirectorJobAsset = typeof directorJobAssets.$inferInsert;

export const directorWebhookReceipts = mysqlTable("director_webhook_receipts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  provider: varchar("provider", { length: 64 }).notNull(),
  externalTaskId: varchar("externalTaskId", { length: 255 }).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
  payload: text("payload").notNull(),
  retryOfReceiptId: int("retryOfReceiptId"),
  status: mysqlEnum("status", ["received", "applied", "ignored", "failed"]).default("received").notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DirectorWebhookReceipt = typeof directorWebhookReceipts.$inferSelect;
export type InsertDirectorWebhookReceipt = typeof directorWebhookReceipts.$inferInsert;

export const appNotifications = mysqlTable("app_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  entityId: varchar("entityId", { length: 128 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppNotification = typeof appNotifications.$inferSelect;
export type InsertAppNotification = typeof appNotifications.$inferInsert;

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  sessionId: varchar("sessionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
