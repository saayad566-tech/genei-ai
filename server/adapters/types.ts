/**
 * Execution-plane adapter contract.
 *
 * Every adapter that performs real work implements this. The Director talks to the
 * execution plane only through these methods, which is what keeps it model-agnostic.
 *
 * An adapter must never report success it cannot evidence: `generate` resolves with
 * `status: "completed"` only when the output artifact exists and has been checked.
 */

export type AdapterState =
  | "ready"
  | "degraded"
  | "stopped"
  | "installing"
  | "failed"
  | "unsupported"
  | "not_installed"
  | "needs_source";

export type AdapterStatus = {
  state: AdapterState;
  /** Human-readable, specific, and honest. */
  message: string;
  /** Which backing tool this adapter drives. */
  toolId: string;
  /** Extra facts a UI can show, e.g. a detected version or an endpoint. */
  detail?: Record<string, string | number | boolean>;
  checkedAt: string;
};

export type ProgressReport = {
  /** 0-100, or null when the backend genuinely cannot report a percentage. */
  percent: number | null;
  stage: string;
  message?: string;
};

export type GenerateOutcome<T> =
  | { status: "completed"; output: T; logs: string[]; durationMs: number }
  | { status: "failed"; error: string; logs: string[]; durationMs: number }
  | { status: "cancelled"; logs: string[]; durationMs: number }
  | { status: "unsupported"; reason: string; logs: string[]; durationMs: number };

export type ProgressSink = (report: ProgressReport) => void;

export type AdapterGenerateOptions = {
  onProgress?: ProgressSink;
  /** Aborts the underlying work when the user cancels. */
  signal?: AbortSignal;
  /** Hard ceiling; a job that exceeds it is stopped and reported as failed. */
  timeoutMs?: number;
};

export interface ExecutionAdapter {
  readonly id: string;
  readonly toolId: string;
  readonly category: "video" | "image" | "lipsync" | "audio" | "upscale" | "review" | "media" | "text";
  /**
   * Install or update the backing tool. Delegates to the shared installer, which
   * performs real downloads and verifies them; the adapter reports the resulting
   * state rather than assuming success.
   */
  install(options?: { allowElevatedCommands?: boolean }): Promise<AdapterStatus>;
  /** Real health probe. Must not report ready without one. */
  healthCheck(): Promise<AdapterStatus>;
  /** What this adapter can actually do, as advertised to the router. */
  getCapabilities(): Promise<Record<string, boolean | string | string[]>>;
  /** Free-form recent log lines for the UI. */
  getLogs(): string[];
}

export class AdapterTimeoutError extends Error {
  constructor(ms: number) {
    super(`The job exceeded its ${Math.round(ms / 1000)}s time limit and was stopped.`);
    this.name = "AdapterTimeoutError";
  }
}

/**
 * Run a promise with a deadline and an abort signal, reporting a clean failure
 * instead of hanging the queue forever.
 */
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, options: AdapterGenerateOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new AdapterTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Bounded in-memory log ring so a chatty backend cannot exhaust memory. */
export class LogRing {
  private readonly lines: string[] = [];
  constructor(private readonly limit = 200) {}
  push(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.lines.push(trimmed);
    if (this.lines.length > this.limit) this.lines.splice(0, this.lines.length - this.limit);
  }
  pushMany(lines: string[]): void {
    for (const line of lines) this.push(line);
  }
  all(): string[] {
    return [...this.lines];
  }
}
