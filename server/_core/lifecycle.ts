/**
 * Lifecycle: shutting down cleanly, and recovering a wedged child.
 *
 * Two failure classes this addresses.
 *
 * **Half-finished work on exit.** A render or a download killed mid-flight leaves an
 * artifact that looks complete and is not. Shutdown drains what is running, with a
 * deadline so a stuck job cannot prevent the app from closing.
 *
 * **A wedged child process.** A long-running helper can stop responding without dying.
 * A supervisor that restarts it, with backoff and a restart cap, turns a frozen feature
 * into a few seconds of delay — and stops after the cap rather than looping forever.
 */
import { logger } from "./logger";

export type Drainable = {
  name: string;
  /** Finish what is in flight. Should resolve, not reject. */
  drain: () => Promise<void>;
};

export class Lifecycle {
  private readonly drainables: Drainable[] = [];
  private shuttingDown = false;
  private readonly startedAt = Date.now();

  register(drainable: Drainable): void {
    this.drainables.push(drainable);
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Drain everything registered, with a deadline.
   *
   * A drainable that hangs does not hold up the rest: each gets its own budget, and the
   * overall deadline is enforced. Reporting which ones timed out is the point — silently
   * abandoning work is how you get a corrupt file nobody can explain.
   */
  async shutdown(input: { deadlineMs?: number; perItemMs?: number } = {}): Promise<{
    drained: string[];
    timedOut: string[];
    elapsedMs: number;
  }> {
    if (this.shuttingDown) return { drained: [], timedOut: [], elapsedMs: 0 };
    this.shuttingDown = true;
    const started = Date.now();
    const deadlineMs = input.deadlineMs ?? 15_000;
    const perItemMs = input.perItemMs ?? 5_000;
    const drained: string[] = [];
    const timedOut: string[] = [];

    logger.info("Shutting down", { drainables: this.drainables.length, uptimeMs: started - this.startedAt });

    for (const item of this.drainables) {
      if (Date.now() - started > deadlineMs) {
        timedOut.push(item.name);
        logger.warn("Skipped drain: overall deadline reached", { name: item.name });
        continue;
      }
      try {
        await Promise.race([
          item.drain(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("drain timed out")), perItemMs)),
        ]);
        drained.push(item.name);
      } catch (error) {
        timedOut.push(item.name);
        logger.warn("Drain did not finish", { name: item.name, reason: error instanceof Error ? error.message : "unknown" });
      }
    }

    const elapsedMs = Date.now() - started;
    logger.info("Shutdown complete", { drained, timedOut, elapsedMs });
    return { drained, timedOut, elapsedMs };
  }
}

export const lifecycle = new Lifecycle();

/* ------------------------------------------------------------------ *
 * Supervisor
 * ------------------------------------------------------------------ */

export type SupervisedProcess = {
  name: string;
  /** Whether it is currently supposed to be running. */
  isRunning: () => boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** A probe that fails when the process is wedged rather than dead. */
  isHealthy?: () => Promise<boolean>;
};

export class Supervisor {
  private readonly restarts = new Map<string, number[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly options: { maxRestarts?: number; windowMs?: number; backoffMs?: number } = {},
  ) {}

  private recentRestarts(name: string, now: number, windowMs: number): number[] {
    const list = (this.restarts.get(name) ?? []).filter((at) => now - at < windowMs);
    this.restarts.set(name, list);
    return list;
  }

  /**
   * Restart a process that has died or stopped responding.
   *
   * Bounded: after the cap inside the window it stops trying and says so, because a
   * crash loop that restarts forever is worse than one that gives up and reports.
   */
  async ensureHealthy(process_: SupervisedProcess): Promise<{ restarted: boolean; reason: string }> {
    const now = Date.now();
    const windowMs = this.options.windowMs ?? 5 * 60_000;
    const maxRestarts = this.options.maxRestarts ?? 3;

    let healthy = process_.isRunning();
    if (healthy && process_.isHealthy) {
      try { healthy = await process_.isHealthy(); } catch { healthy = false; }
    }
    if (healthy) return { restarted: false, reason: `${process_.name} is healthy.` };

    const recent = this.recentRestarts(process_.name, now, windowMs);
    if (recent.length >= maxRestarts) {
      return {
        restarted: false,
        reason: `${process_.name} has already been restarted ${recent.length} times in the last ${Math.round(windowMs / 60_000)} minutes, so it is not being restarted again. Something is wrong that a restart will not fix.`,
      };
    }

    // Back off further with each restart inside the window.
    const backoff = (this.options.backoffMs ?? 500) * 2 ** recent.length;
    await new Promise<void>((resolve) => setTimeout(resolve, backoff));

    try {
      await process_.stop().catch(() => undefined);
      await process_.start();
      recent.push(Date.now());
      this.restarts.set(process_.name, recent);
      logger.info("Restarted a supervised process", { name: process_.name, attempt: recent.length });
      return { restarted: true, reason: `Restarted ${process_.name} (attempt ${recent.length} of ${maxRestarts}).` };
    } catch (error) {
      return { restarted: false, reason: `${process_.name} could not be restarted: ${error instanceof Error ? error.message : "unknown error"}.` };
    }
  }

  /** Forget the restart history, e.g. after the user asks for a retry. */
  reset(name?: string): void {
    if (name) this.restarts.delete(name);
    else this.restarts.clear();
  }

  history(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, list] of Array.from(this.restarts.entries())) out[name] = list.length;
    return out;
  }
}

export const supervisor = new Supervisor();
