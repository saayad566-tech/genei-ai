/**
 * Local state backup and restore.
 *
 * The research on desktop persistence is consistent: write atomically, keep history, and
 * never let a reader see a half-written file. That is what this does.
 *
 *  - **Atomic writes.** State goes to a temporary file and is renamed over the target, so
 *    a crash mid-write leaves the previous good file rather than a corrupt one.
 *  - **Snapshot history.** A bounded ring of previous snapshots, so "I broke it" has an
 *    answer that is not "reinstall".
 *  - **Secure permissions.** State and snapshots are 0600 inside a 0700 directory.
 *  - **Dirty tracking.** A heartbeat only writes when something actually changed, which
 *    is the difference between a background writer and a background disk heater.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";

export type SnapshotInfo = { name: string; createdAt: string; bytes: number };

/** Write a file so a reader never sees a partial one. */
export function writeAtomic(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, contents, { mode: 0o600 });
  fs.renameSync(temp, target);
}

export function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export class StateStore<T extends Record<string, unknown>> {
  private snapshot: T;
  private dirty = false;
  private snapshotSeq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly defaults: T,
    private readonly options: { snapshotDir?: string; maxSnapshots?: number; heartbeatMs?: number } = {},
  ) {
    this.snapshot = readJson<T>(filePath) ?? { ...defaults };
  }

  get(): T {
    return this.snapshot;
  }

  /** Merge a change and mark it for the next heartbeat. */
  update(patch: Partial<T>): T {
    this.snapshot = { ...this.snapshot, ...patch };
    this.dirty = true;
    return this.snapshot;
  }

  /** Write now, taking a snapshot of the previous contents first. */
  save(): { written: boolean; snapshot?: SnapshotInfo } {
    if (!this.dirty) return { written: false };
    const previous = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath, "utf8") : undefined;
    let snapshot: SnapshotInfo | undefined;
    if (previous) snapshot = this.takeSnapshot(previous);
    writeAtomic(this.filePath, JSON.stringify(this.snapshot, null, 2));
    this.dirty = false;
    return { written: true, snapshot };
  }

  private takeSnapshot(contents: string): SnapshotInfo | undefined {
    const dir = this.options.snapshotDir;
    if (!dir) return undefined;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const createdAt = new Date().toISOString();
      // A counter as well as the timestamp: two snapshots inside the same second would
      // otherwise share a name, and the second would silently overwrite the first.
      this.snapshotSeq += 1;
      const name = `state-${createdAt.replace(/[:.]/g, "-")}-${String(this.snapshotSeq).padStart(3, "0")}.json`;
      const full = path.join(dir, name);
      fs.writeFileSync(full, contents, { mode: 0o600 });

      // Bounded history: keep the newest N and drop the rest.
      const max = this.options.maxSnapshots ?? 10;
      const existing = fs.readdirSync(dir).filter((file) => file.startsWith("state-") && file.endsWith(".json")).sort();
      for (const stale of existing.slice(0, Math.max(0, existing.length - max))) {
        fs.rmSync(path.join(dir, stale), { force: true });
      }
      return { name, createdAt, bytes: contents.length };
    } catch {
      return undefined;
    }
  }

  /** Start the heartbeat. It only writes when something changed. */
  startHeartbeat(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.save(), this.options.heartbeatMs ?? 30_000);
    this.timer.unref?.();
  }

  stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  listSnapshots(): SnapshotInfo[] {
    const dir = this.options.snapshotDir;
    if (!dir || !fs.existsSync(dir)) return [];
    try {
      return fs.readdirSync(dir)
        .filter((file) => file.startsWith("state-") && file.endsWith(".json"))
        .sort()
        .reverse()
        .map((file) => {
          const full = path.join(dir, file);
          const stat = fs.statSync(full);
          return { name: file, createdAt: stat.mtime.toISOString(), bytes: stat.size };
        });
    } catch {
      return [];
    }
  }

  /**
   * Restore a snapshot.
   *
   * The current state is snapshotted first, so a restore is itself undoable. Restoring is
   * a destructive act and should not be the one thing that cannot be taken back.
   */
  restore(name: string): { ok: boolean; message: string } {
    const dir = this.options.snapshotDir;
    if (!dir) return { ok: false, message: "Snapshots are not enabled, so there is nothing to restore." };
    const full = path.join(dir, name);
    if (!full.startsWith(path.resolve(dir))) return { ok: false, message: "That snapshot path is outside the snapshot directory." };
    const contents = (() => { try { return fs.readFileSync(full, "utf8"); } catch { return undefined; } })();
    if (!contents) return { ok: false, message: `${name} could not be read.` };

    const parsed = (() => { try { return JSON.parse(contents) as T; } catch { return undefined; } })();
    if (!parsed) return { ok: false, message: `${name} is not valid state, so it was not restored.` };

    if (fs.existsSync(this.filePath)) {
      this.takeSnapshot(fs.readFileSync(this.filePath, "utf8"));
    }
    this.snapshot = parsed;
    writeAtomic(this.filePath, JSON.stringify(parsed, null, 2));
    this.dirty = false;
    logger.info("Restored a state snapshot", { name });
    return { ok: true, message: `Restored ${name}. The state it replaced was snapshotted first.` };
  }
}
