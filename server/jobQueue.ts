/**
 * Resource-aware job queue.
 *
 * Why this exists: running several AI models at once is what makes a laptop
 * freeze, thrash, or hit an out-of-memory kill. Every resource-intensive job
 * (video generation, upscaling, lip-sync, large image batches) is enqueued here
 * instead of being fired concurrently. Exactly one heavy job runs at a time by
 * default, and a job whose estimated peak will not fit in the remaining budget is
 * deferred rather than attempted-and-crashed.
 *
 * Nothing in this module fabricates progress: a job is reported as queued until
 * it genuinely starts, and as running only while its own promise is live.
 */

export type JobWeight = "heavy" | "light";

export type ResourceBudget = {
  /** System memory the queue is allowed to plan against. */
  ramBudgetMB: number;
  /** Accelerator memory the queue is allowed to plan against. */
  vramBudgetMB: number;
  /** Heavy jobs allowed to run simultaneously. 1 is the laptop-safe default. */
  maxConcurrentHeavyJobs: number;
  /** Fraction of the budget at which admission pauses (0-1). */
  highWaterMarkRatio: number;
};

export type JobDescriptor = {
  id: string;
  label: string;
  weight: JobWeight;
  /** Best-effort peak footprint of this job in MB. */
  estimatedPeakMB: number;
};

export type QueueSnapshot = {
  running: JobDescriptor[];
  queued: JobDescriptor[];
  budget: ResourceBudget;
  reservedMB: number;
  paused: boolean;
  pauseReason: string | null;
  completed: number;
  failed: number;
  cancelled: number;
};

export type PressureReading = {
  freeRamMB: number;
  freeVramMB?: number;
};

type InternalJob<T> = JobDescriptor & {
  run: (signal: AbortSignal) => Promise<T>;
  settle: { resolve: (value: T) => void; reject: (error: unknown) => void };
  controller: AbortController;
};

export class QueueCancelledError extends Error {
  constructor(id: string) {
    super(`Job ${id} was cancelled.`);
    this.name = "QueueCancelledError";
  }
}

const DEFAULT_BUDGET: ResourceBudget = {
  ramBudgetMB: 4096,
  vramBudgetMB: 0,
  maxConcurrentHeavyJobs: 1,
  highWaterMarkRatio: 0.9,
};

/**
 * Derive a queue budget from a real hardware profile. Unmeasurable values stay at
 * the conservative default rather than being invented.
 */
/** The smallest budget worth planning against; always capped by measured RAM. */
const MIN_BUDGET_MB = 256;

export function budgetFromHardware(profile: {
  ramGB?: number | null;
  vramGB?: number | null;
} | null | undefined): ResourceBudget {
  const hasRam = typeof profile?.ramGB === "number" && profile.ramGB > 0;
  const ramMB = hasRam ? Math.round((profile?.ramGB as number) * 1024) : DEFAULT_BUDGET.ramBudgetMB;
  const vramMB = typeof profile?.vramGB === "number" && profile.vramGB > 0 ? Math.round(profile.vramGB * 1024) : 0;
  return {
    // Never plan against more than 60% of measured system RAM: the OS, the Electron
    // shell and the user's other applications need the rest. When RAM is unknown we
    // keep the documented conservative default rather than reducing it a second time.
    //
    // The minimum must never exceed that share. A flat 1024 MB floor gave a 1 GB
    // machine a budget of 1024 MB — 100% of its memory — which is precisely how a
    // small laptop gets driven into swap and freezes. The floor is now bounded by the
    // machine's own RAM, so a small computer is given a small budget.
    ramBudgetMB: hasRam ? Math.min(ramMB, Math.max(MIN_BUDGET_MB, Math.round(ramMB * 0.6))) : DEFAULT_BUDGET.ramBudgetMB,
    vramBudgetMB: vramMB,
    maxConcurrentHeavyJobs: 1,
    highWaterMarkRatio: DEFAULT_BUDGET.highWaterMarkRatio,
  };
}

export class ResourceAwareQueue {
  private readonly running = new Map<string, InternalJob<unknown>>();
  private readonly waiting: InternalJob<unknown>[] = [];
  private budget: ResourceBudget;
  private reservedMB = 0;
  private paused = false;
  private pauseReason: string | null = null;
  private counters = { completed: 0, failed: 0, cancelled: 0 };
  private sequence = 0;

  constructor(budget: ResourceBudget = DEFAULT_BUDGET) {
    this.budget = budget;
  }

  setBudget(budget: Partial<ResourceBudget>): void {
    this.budget = { ...this.budget, ...budget };
    this.drain();
  }

  getBudget(): ResourceBudget {
    return { ...this.budget };
  }

  /** Pause admission (e.g. the OS reports memory pressure). Running jobs continue. */
  pause(reason: string): void {
    this.paused = true;
    this.pauseReason = reason;
  }

  resume(): void {
    this.paused = false;
    this.pauseReason = null;
    this.drain();
  }

  /**
   * React to a real memory reading. Below the high-water mark admission pauses so
   * the next heavy job is not started into a machine that is already struggling.
   */
  reportPressure(reading: PressureReading): void {
    const floor = this.budget.ramBudgetMB * (1 - this.budget.highWaterMarkRatio);
    if (reading.freeRamMB < floor) {
      this.pause(`Only ${Math.round(reading.freeRamMB)} MB of memory is free; waiting for the system to recover.`);
    } else if (this.paused && this.pauseReason?.startsWith("Only ")) {
      this.resume();
    }
  }

  enqueue<T>(descriptor: Omit<JobDescriptor, "id"> & { id?: string }, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const id = descriptor.id ?? `job-${++this.sequence}`;
    if (this.running.has(id) || this.waiting.some((job) => job.id === id)) {
      return Promise.reject(new Error(`A job with id ${id} is already queued or running.`));
    }
    const job: InternalJob<T> = {
      id,
      label: descriptor.label,
      weight: descriptor.weight,
      estimatedPeakMB: Math.max(0, Math.round(descriptor.estimatedPeakMB)),
      run,
      controller: new AbortController(),
      settle: { resolve: () => {}, reject: () => {} },
    };
    const promise = new Promise<T>((resolve, reject) => {
      job.settle = { resolve: resolve as (value: unknown) => void, reject };
    });
    this.waiting.push(job as InternalJob<unknown>);
    this.drain();
    return promise;
  }

  cancel(id: string): boolean {
    const waitingIndex = this.waiting.findIndex((job) => job.id === id);
    if (waitingIndex >= 0) {
      const [job] = this.waiting.splice(waitingIndex, 1);
      this.counters.cancelled += 1;
      job.settle.reject(new QueueCancelledError(id));
      return true;
    }
    const running = this.running.get(id);
    if (running) {
      running.controller.abort();
      return true;
    }
    return false;
  }

  snapshot(): QueueSnapshot {
    const describe = (job: InternalJob<unknown>): JobDescriptor => ({
      id: job.id,
      label: job.label,
      weight: job.weight,
      estimatedPeakMB: job.estimatedPeakMB,
    });
    return {
      running: Array.from(this.running.values()).map(describe),
      queued: this.waiting.map(describe),
      budget: this.getBudget(),
      reservedMB: this.reservedMB,
      paused: this.paused,
      pauseReason: this.pauseReason,
      ...this.counters,
    };
  }

  private runningHeavyCount(): number {
    let count = 0;
    for (const job of Array.from(this.running.values())) if (job.weight === "heavy") count += 1;
    return count;
  }

  /**
   * Admission control. A light job may always start; a heavy job must satisfy both
   * the concurrency cap and the memory budget, otherwise it stays queued.
   */
  private admits(job: InternalJob<unknown>): boolean {
    if (job.weight === "light") return true;
    if (this.runningHeavyCount() >= this.budget.maxConcurrentHeavyJobs) return false;
    const ceiling = this.budget.vramBudgetMB > 0 ? this.budget.vramBudgetMB : this.budget.ramBudgetMB;
    return this.reservedMB + job.estimatedPeakMB <= ceiling;
  }

  private drain(): void {
    if (this.paused) return;
    for (let index = 0; index < this.waiting.length; ) {
      const job = this.waiting[index];
      if (!this.admits(job)) {
        index += 1;
        continue;
      }
      this.waiting.splice(index, 1);
      this.start(job);
    }
  }

  private start(job: InternalJob<unknown>): void {
    this.running.set(job.id, job);
    if (job.weight === "heavy") this.reservedMB += job.estimatedPeakMB;

    const release = () => {
      this.running.delete(job.id);
      if (job.weight === "heavy") this.reservedMB = Math.max(0, this.reservedMB - job.estimatedPeakMB);
      this.drain();
    };

    job
      .run(job.controller.signal)
      .then((value) => {
        this.counters.completed += 1;
        release();
        job.settle.resolve(value);
      })
      .catch((error: unknown) => {
        if (job.controller.signal.aborted || error instanceof QueueCancelledError) {
          this.counters.cancelled += 1;
          release();
          job.settle.reject(new QueueCancelledError(job.id));
          return;
        }
        this.counters.failed += 1;
        release();
        job.settle.reject(error);
      });
  }
}

/** Process-wide queue. One heavy job at a time unless the hardware says otherwise. */
export const filmJobQueue = new ResourceAwareQueue(DEFAULT_BUDGET);
