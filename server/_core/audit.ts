/**
 * Audit trail.
 *
 * Some actions matter enough that "what happened?" has to be answerable later: a key was
 * added or removed, a model was installed or deleted, a job was cancelled, a setting that
 * changes behaviour was altered. The structured log is for debugging; this is for
 * accountability, so it records the actor, the action, the target and the outcome — and
 * never the secret involved.
 *
 * Append-only, bounded, and rotated, because an audit trail that grows without limit is
 * a disk-space bug wearing a security badge.
 */
import fs from "node:fs";
import path from "node:path";

export const AUDIT_ACTIONS = [
  "apiKey.added", "apiKey.removed", "apiKey.activated", "apiKey.deactivated",
  "model.installed", "model.removed", "model.ran",
  "job.queued", "job.cancelled", "job.retried",
  "cache.cleared", "settings.changed",
  "project.created", "project.deleted",
  "export.created", "runner.paired", "runner.revoked",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Actions that should be recorded even when auditing is otherwise quiet. */
const SENSITIVE = new Set<AuditAction>([
  "apiKey.added", "apiKey.removed", "project.deleted", "model.removed", "runner.revoked", "settings.changed",
]);

export type AuditEntry = {
  time: string;
  action: AuditAction;
  userId: number | null;
  /** What the action was performed on, e.g. a model id or a key provider. */
  target?: string;
  outcome: "ok" | "failed";
  detail?: string;
};

export class AuditTrail {
  private readonly entries: AuditEntry[] = [];

  constructor(
    private readonly options: { filePath?: string; maxEntries?: number; maxFileBytes?: number } = {},
  ) {}

  record(entry: Omit<AuditEntry, "time">): AuditEntry {
    const full: AuditEntry = { time: new Date().toISOString(), ...entry };
    this.entries.push(full);
    const cap = this.options.maxEntries ?? 500;
    if (this.entries.length > cap) this.entries.splice(0, this.entries.length - cap);
    this.persist(full);
    return full;
  }

  private persist(entry: AuditEntry): void {
    if (!this.options.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.options.filePath), { recursive: true, mode: 0o700 });
      this.rotateIfNeeded();
      fs.appendFileSync(this.options.filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    } catch {
      // An audit write must never break the action it is recording.
    }
  }

  /** Keep one previous file, so the trail survives a rotation. */
  private rotateIfNeeded(): void {
    const filePath = this.options.filePath;
    if (!filePath) return;
    try {
      const max = this.options.maxFileBytes ?? 2 * 1024 * 1024;
      if (!fs.existsSync(filePath)) return;
      if (fs.statSync(filePath).size < max) return;
      fs.renameSync(filePath, `${filePath}.1`);
    } catch {
      // Rotation is best-effort.
    }
  }

  recent(limit = 100, filter?: { action?: AuditAction; userId?: number }): AuditEntry[] {
    let list = this.entries;
    if (filter?.action) list = list.filter((entry) => entry.action === filter.action);
    if (filter?.userId !== undefined) list = list.filter((entry) => entry.userId === filter.userId);
    return list.slice(-limit).reverse();
  }

  /** Counts by action, for the diagnostics surface. */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const entry of this.entries) out[entry.action] = (out[entry.action] ?? 0) + 1;
    return out;
  }

  isSensitive(action: AuditAction): boolean {
    return SENSITIVE.has(action);
  }
}

export const audit = new AuditTrail({ filePath: process.env.GENEI_AUDIT_FILE?.trim() || undefined });
