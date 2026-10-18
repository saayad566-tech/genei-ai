/**
 * Structured logging.
 *
 * The platform had a plain diagnostic writer, which is enough to see that something
 * happened but not enough to find out why. This adds the three things that make logs
 * actually usable on a machine you do not have in front of you:
 *
 *  - **Levels**, so a noisy debug line can exist without drowning the log.
 *  - **Correlation ids**, so every line from one operation can be pulled out together.
 *  - **Redaction**, because a log is the easiest place to leak a credential by accident.
 *    Anything that looks like a key, token or password is masked before it is written.
 *
 * Writes are buffered and flushed on a timer rather than synchronously per line: a
 * synchronous append per log line is a real performance problem, and this is the same
 * mistake that was fixed once already in the desktop shell.
 */
import fs from "node:fs";
import path from "node:path";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogRecord = {
  time: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  fields?: Record<string, unknown>;
};

/**
 * Mask anything that looks like a credential.
 *
 * Deliberately broad: a false positive costs a masked log line, a false negative costs a
 * leaked key. Known prefixes are masked whole; long opaque strings are truncated.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^(sk-|hf_|ghp_|github_pat_|AKIA|xox[baprs]-|eyJ)/.test(value)) return `${value.slice(0, 6)}…[redacted]`;
    if (/bearer\s+[A-Za-z0-9._-]{12,}/i.test(value)) return value.replace(/(bearer\s+)[A-Za-z0-9._-]{12,}/gi, "$1[redacted]");
    if (value.length > 300) return `${value.slice(0, 300)}…[truncated ${value.length - 300} chars]`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redact(entry, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // The key itself is a strong signal.
    if (/(pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(entry, depth + 1);
    }
  }
  return out;
}

/** A short id for tying the lines of one operation together. */
export function newCorrelationId(prefix = "op"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Logger {
  private readonly buffer: LogRecord[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly minRank: number;

  constructor(
    private readonly options: {
      level?: LogLevel;
      filePath?: string;
      /** Lines held before a flush is forced. */
      maxBuffer?: number;
      flushIntervalMs?: number;
      /** Also write to stdout, for a terminal run. */
      console?: boolean;
    } = {},
  ) {
    this.minRank = LEVEL_RANK[options.level ?? (process.env.GENEI_LOG_LEVEL as LogLevel) ?? "info"] ?? LEVEL_RANK.info;
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= this.minRank;
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>, correlationId?: string): void {
    if (!this.enabled(level)) return;
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...(fields ? { fields: redact(fields) as Record<string, unknown> } : {}),
    };
    this.buffer.push(record);
    if (this.options.console) {
      const line = `${record.time} ${level.toUpperCase()} ${correlationId ? `[${correlationId}] ` : ""}${message}`;
      if (level === "error") console.error(line, record.fields ?? "");
      else if (level === "warn") console.warn(line, record.fields ?? "");
      else console.log(line, record.fields ?? "");
    }
    if (this.buffer.length >= (this.options.maxBuffer ?? 50)) this.flush();
    else this.scheduleFlush();
  }

  debug(message: string, fields?: Record<string, unknown>, correlationId?: string): void { this.log("debug", message, fields, correlationId); }
  info(message: string, fields?: Record<string, unknown>, correlationId?: string): void { this.log("info", message, fields, correlationId); }
  warn(message: string, fields?: Record<string, unknown>, correlationId?: string): void { this.log("warn", message, fields, correlationId); }
  error(message: string, fields?: Record<string, unknown>, correlationId?: string): void { this.log("error", message, fields, correlationId); }

  /** Bind a correlation id, so a caller does not have to thread it through every call. */
  withCorrelation(correlationId: string) {
    return {
      debug: (message: string, fields?: Record<string, unknown>) => this.debug(message, fields, correlationId),
      info: (message: string, fields?: Record<string, unknown>) => this.info(message, fields, correlationId),
      warn: (message: string, fields?: Record<string, unknown>) => this.warn(message, fields, correlationId),
      error: (message: string, fields?: Record<string, unknown>) => this.error(message, fields, correlationId),
    };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.options.flushIntervalMs ?? 1000);
    // Do not hold the process open just to flush a log line.
    this.flushTimer.unref?.();
  }

  /** Write the buffer. Returns how many lines were written. */
  flush(): number {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return 0;
    const pending = this.buffer.splice(0, this.buffer.length);
    if (!this.options.filePath) return pending.length;
    try {
      fs.mkdirSync(path.dirname(this.options.filePath), { recursive: true, mode: 0o700 });
      // The log can contain paths and model ids; it is not world-readable.
      fs.appendFileSync(this.options.filePath, `${pending.map((record) => JSON.stringify(record)).join("\n")}\n`, { mode: 0o600 });
    } catch {
      // Never let logging break the thing it is describing.
    }
    return pending.length;
  }

  /** Read back the tail of the log, parsed. Used by the diagnostics surface. */
  static readRecent(filePath: string, limit = 100): LogRecord[] {
    try {
      const lines = fs.readFileSync(filePath, "utf8").trim().split("\n").slice(-limit);
      const records: LogRecord[] = [];
      for (const line of lines) {
        try { records.push(JSON.parse(line) as LogRecord); } catch { /* skip a torn line */ }
      }
      return records;
    } catch {
      return [];
    }
  }
}

export const logger = new Logger({
  filePath: process.env.GENEI_LOG_FILE?.trim() || undefined,
  console: process.env.NODE_ENV !== "production",
});
