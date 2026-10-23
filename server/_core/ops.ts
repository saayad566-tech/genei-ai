/**
 * Health, readiness and metrics.
 *
 * A desktop app that stays open for weeks needs to be able to answer three questions
 * without a debugger: is it alive, is it ready to do work, and what has it been doing?
 *
 * The metrics here are deliberately from real counters rather than invented numbers —
 * cache hit rates come from the caches themselves, queue depth from the queue, and
 * outbound failures from the circuit breaker. Nothing on this surface is estimated.
 */
import os from "node:os";
import fs from "node:fs";
import { cacheStats, clearAllCaches, type CacheStats } from "./cache";
import { breaker } from "./resilientFetch";

export type HealthState = "healthy" | "degraded" | "unhealthy";

export type HealthReport = {
  state: HealthState;
  uptimeSeconds: number;
  version: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  checkedAt: string;
};

const startedAt = Date.now();

/** Filesystem free space, for the disk guard and the health surface. */
export function diskSpace(dir: string): { freeBytes: number; totalBytes: number; freeGB: number } | undefined {
  try {
    const stats = fs.statfsSync(dir);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    return { freeBytes, totalBytes, freeGB: Math.round((freeBytes / 1024 ** 3) * 10) / 10 };
  } catch {
    return undefined;
  }
}

/**
 * Refuse a download that cannot possibly fit.
 *
 * Failing before a 30 GB transfer starts is a courtesy; failing 12 GB in is a waste of
 * the user's bandwidth and time. The margin covers the temporary `.part` file plus the
 * space the platform needs to keep working.
 */
export function hasRoomFor(dir: string, neededBytes: number, marginBytes = 2 * 1024 ** 3) {
  const space = diskSpace(dir);
  if (!space) {
    return { ok: true as const, detail: "Free space could not be read, so the download was allowed to proceed." };
  }
  const required = neededBytes + marginBytes;
  if (space.freeBytes < required) {
    const needGB = Math.round((required / 1024 ** 3) * 10) / 10;
    return {
      ok: false as const,
      detail: `This download needs about ${needGB} GB free including working room, and only ${space.freeGB} GB is available. Free some space and try again.`,
    };
  }
  return { ok: true as const, detail: `${space.freeGB} GB free, which covers the download and its working room.` };
}

/** Is the process alive? Deliberately cheap: this is called often. */
export function liveness(): { state: HealthState; uptimeSeconds: number } {
  return { state: "healthy", uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) };
}

/**
 * Is it ready to do useful work?
 *
 * Checks the things that actually gate work — a writable data directory, memory
 * pressure, and whether outbound hosts are currently being skipped — rather than
 * reporting a flat "ok" that would be true even when nothing can run.
 */
export function readiness(input: {
  dataDir: string;
  ramGB?: number | null;
  queuePaused?: boolean;
  queueDepth?: number;
} = { dataDir: "" }): HealthReport {
  const checks: HealthReport["checks"] = [];

  // A probe must never throw. A missing data directory is a "not ready" verdict with a
  // reason, not an exception — an orchestrator reading a stack trace cannot act on it,
  // and a thrown probe looks identical to a crashed process.
  if (!input || typeof input.dataDir !== "string" || input.dataDir.length === 0) {
    checks.push({
      name: "data-directory",
      ok: false,
      detail: "No data directory is configured, so nothing can be written. Set GENEI_DESKTOP_DATA_DIR or ensure the default location is available.",
    });
    return {
      state: "unhealthy",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      version: "unknown",
      checks,
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    fs.mkdirSync(input.dataDir, { recursive: true });
    fs.accessSync(input.dataDir, fs.constants.W_OK);
    checks.push({ name: "data-directory", ok: true, detail: `${input.dataDir} is writable.` });
  } catch (error) {
    checks.push({ name: "data-directory", ok: false, detail: `Not writable: ${error instanceof Error ? error.message : "unknown error"}.` });
  }

  const space = diskSpace(input.dataDir);
  if (space) {
    const ok = space.freeGB >= 1;
    checks.push({ name: "disk-space", ok, detail: `${space.freeGB} GB free.` });
  } else {
    checks.push({ name: "disk-space", ok: true, detail: "Free space could not be read." });
  }

  const openBreakers = Object.entries(breaker.snapshot()).filter(([, state]) => state.open);
  checks.push({
    name: "outbound-hosts",
    ok: openBreakers.length === 0,
    detail: openBreakers.length === 0
      ? "No host is currently being skipped."
      : `Skipping ${openBreakers.map(([host]) => host).join(", ")} until they recover.`,
  });

  if (input.queuePaused !== undefined) {
    checks.push({
      name: "job-queue",
      ok: !input.queuePaused,
      detail: input.queuePaused ? "The queue is paused under memory pressure." : `${input.queueDepth ?? 0} job(s) waiting.`,
    });
  }

  const failed = checks.filter((check) => !check.ok).length;
  return {
    state: failed === 0 ? "healthy" : failed === 1 ? "degraded" : "unhealthy",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? "unknown",
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export type Metrics = {
  process: { uptimeSeconds: number; rssMB: number; heapUsedMB: number; heapTotalMB: number };
  system: { totalRamMB: number; freeRamMB: number; loadAverage: number[]; cpuCount: number };
  caches: Record<string, CacheStats>;
  outbound: { hostsTracked: number; hostsSkipped: string[] };
  rateLimits: Record<string, { consumed: number; limit: number }>;
};

/** Real counters, read from the components that own them. */
export function metrics(rateLimits: Record<string, { consumed: number; limit: number }> = {}): Metrics {
  const memory = process.memoryUsage();
  const toMB = (bytes: number) => Math.round((bytes / 1024 ** 2) * 10) / 10;
  const snapshot = breaker.snapshot();
  return {
    process: {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      rssMB: toMB(memory.rss),
      heapUsedMB: toMB(memory.heapUsed),
      heapTotalMB: toMB(memory.heapTotal),
    },
    system: {
      totalRamMB: Math.round(os.totalmem() / 1024 ** 2),
      freeRamMB: Math.round(os.freemem() / 1024 ** 2),
      loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
      cpuCount: os.cpus().length,
    },
    caches: cacheStats(),
    outbound: {
      hostsTracked: Object.keys(snapshot).length,
      hostsSkipped: Object.entries(snapshot).filter(([, state]) => state.open).map(([host]) => host),
    },
    rateLimits,
  };
}

/** Drop every cache. Exposed so a user can force fresh data without restarting. */
export function resetCaches(): number {
  const before = Object.values(cacheStats()).reduce((total, stats) => total + stats.size, 0);
  clearAllCaches();
  return before;
}
