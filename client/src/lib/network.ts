import { useEffect, useState } from "react";

/**
 * Connectivity, treated honestly.
 *
 * `navigator.onLine` is a **hint, not proof**. It reports online behind a captive portal
 * with no working internet, and it reports offline while requests still succeed. So
 * nothing here gates a critical action on it — a request that fails is handled as a
 * failure, and this state is used to give the user context rather than to block them.
 */

export type NetworkQuality = "offline" | "slow" | "online" | "unknown";

export type NetworkState = {
  /** The platform's opinion. A hint, not a guarantee. */
  online: boolean;
  quality: NetworkQuality;
  /** Effective connection type when the browser reports one. */
  effectiveType?: string;
  /** Downlink estimate in Mbps, when reported. */
  downlinkMbps?: number;
  /** Round-trip estimate in milliseconds, when reported. */
  rttMs?: number;
};

type ConnectionInfo = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function connection(): ConnectionInfo | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection;
}

function readState(): NetworkState {
  if (typeof navigator === "undefined") return { online: true, quality: "unknown" };
  const online = navigator.onLine;
  const info = connection();
  if (!online) return { online, quality: "offline" };

  const rttMs = info?.rtt;
  const downlinkMbps = info?.downlink;
  const effectiveType = info?.effectiveType;

  // "Slow" is a judgement about whether a large download is sensible, not a failure.
  const slow =
    effectiveType === "slow-2g" || effectiveType === "2g" ||
    (rttMs !== undefined && rttMs > 800) ||
    (downlinkMbps !== undefined && downlinkMbps < 0.5) ||
    info?.saveData === true;

  return {
    online,
    quality: slow ? "slow" : "online",
    effectiveType,
    downlinkMbps,
    rttMs,
  };
}

/** Observe connectivity. Returns the current state and updates it as it changes. */
export function useNetworkState(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => readState());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setState(readState());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const info = connection();
    info?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      info?.removeEventListener?.("change", update);
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------------ *
 * Deferred work
 * ------------------------------------------------------------------ */

export type QueuedTask = {
  id: string;
  label: string;
  /** Attempt the work. Throw to keep it queued. */
  run: () => Promise<void>;
  attempts: number;
  createdAt: number;
  lastError?: string;
};

/**
 * A queue of work that could not be completed while offline.
 *
 * The point is that a user who loses connectivity mid-action does not lose the action.
 * Tasks are attempted on reconnect, with a bounded attempt count so a permanently failing
 * task stops rather than retrying forever.
 */
export class OfflineQueue {
  private readonly tasks: QueuedTask[] = [];

  constructor(private readonly maxAttempts = 5) {}

  enqueue(label: string, run: () => Promise<void>): QueuedTask {
    const task: QueuedTask = {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      run,
      attempts: 0,
      createdAt: Date.now(),
    };
    this.tasks.push(task);
    return task;
  }

  list(): QueuedTask[] {
    return [...this.tasks];
  }

  get size(): number {
    return this.tasks.length;
  }

  /**
   * Attempt every queued task.
   *
   * A task that throws stays queued until it hits the attempt cap, at which point it is
   * dropped with its last error recorded rather than silently vanishing.
   */
  async flush(): Promise<{ succeeded: string[]; failed: string[]; abandoned: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];
    const abandoned: string[] = [];

    for (const task of [...this.tasks]) {
      try {
        await task.run();
        succeeded.push(task.id);
        this.remove(task.id);
      } catch (error) {
        task.attempts += 1;
        task.lastError = error instanceof Error ? error.message : "unknown error";
        if (task.attempts >= this.maxAttempts) {
          abandoned.push(task.id);
          this.remove(task.id);
        } else {
          failed.push(task.id);
        }
      }
    }
    return { succeeded, failed, abandoned };
  }

  remove(id: string): boolean {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  clear(): void {
    this.tasks.length = 0;
  }
}

export const offlineQueue = new OfflineQueue();

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

export type Freshness = { label: string; stale: boolean };

/**
 * Describe how old some data is.
 *
 * The research is clear that showing stale content with a "last updated" note beats a
 * skeleton: the user sees the information immediately and knows how much to trust it.
 */
export function describeFreshness(timestamp: number | undefined, now = Date.now()): Freshness {
  if (!timestamp) return { label: "not yet loaded", stale: true };
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return { label: "just now", stale: false };
  if (seconds < 60) return { label: `${seconds}s ago`, stale: false };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { label: `${minutes}m ago`, stale: minutes > 5 };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, stale: true };
  return { label: `${Math.round(hours / 24)}d ago`, stale: true };
}
