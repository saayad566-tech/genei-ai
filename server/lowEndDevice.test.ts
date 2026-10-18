import { describe, expect, it } from "vitest";
import { budgetFromHardware, ResourceAwareQueue } from "./jobQueue";

/**
 * Low-end device behaviour.
 *
 * The reported failure was the app freezing on ordinary laptops. The budget is what
 * prevents that, so it is checked across the machine sizes that actually exist rather
 * than only on a generous one.
 */

describe("resource budget on small machines", () => {
  it("never plans against more than the machine actually has", () => {
    for (const ramGB of [0.5, 1, 1.5, 2, 3, 4, 8, 16, 32, 64]) {
      const budget = budgetFromHardware({ ramGB });
      expect(budget.ramBudgetMB, `${ramGB} GB machine`).toBeLessThanOrEqual(ramGB * 1024);
    }
  });

  it("takes roughly 60% of measured RAM on a normal machine", () => {
    expect(budgetFromHardware({ ramGB: 8 }).ramBudgetMB).toBe(Math.round(8192 * 0.6));
    expect(budgetFromHardware({ ramGB: 16 }).ramBudgetMB).toBe(Math.round(16384 * 0.6));
  });

  it("gives a 1 GB machine a small budget, not a 1024 MB one", () => {
    // The old floor handed a 1 GB laptop a budget equal to all of its memory.
    const budget = budgetFromHardware({ ramGB: 1 });
    expect(budget.ramBudgetMB).toBe(614);
    expect(budget.ramBudgetMB).toBeLessThan(1024);
  });

  it("stays within 60% on every machine size", () => {
    for (const ramGB of [1, 1.5, 2, 3, 4, 6, 8, 12, 16]) {
      const budget = budgetFromHardware({ ramGB });
      const share = budget.ramBudgetMB / (ramGB * 1024);
      expect(share, `${ramGB} GB machine used ${(share * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.601);
    }
  });

  it("keeps the documented default when RAM cannot be measured", () => {
    for (const unknown of [null, undefined, {}, { ramGB: null }, { ramGB: 0 }, { ramGB: -4 }]) {
      expect(budgetFromHardware(unknown as never).ramBudgetMB).toBe(4096);
    }
  });

  it("allows only one heavy job at a time on any machine", () => {
    for (const ramGB of [1, 2, 8, 64]) {
      expect(budgetFromHardware({ ramGB }).maxConcurrentHeavyJobs).toBe(1);
    }
  });

  it("reports no VRAM budget when there is no usable GPU", () => {
    expect(budgetFromHardware({ ramGB: 8, vramGB: null }).vramBudgetMB).toBe(0);
    expect(budgetFromHardware({ ramGB: 8, vramGB: 0 }).vramBudgetMB).toBe(0);
    expect(budgetFromHardware({ ramGB: 8, vramGB: 8 }).vramBudgetMB).toBe(8192);
  });
});

describe("admission on a small machine", () => {
  it("defers a job larger than the whole budget instead of attempting it", async () => {
    const queue = new ResourceAwareQueue(budgetFromHardware({ ramGB: 1 }));
    let ran = false;
    // A 4 GB job on a 614 MB budget must never start; it waits.
    const pending = queue.enqueue({ id: "huge", label: "huge render", weight: "heavy", estimatedPeakMB: 4096 }, async () => {
      ran = true;
      return "done";
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const snapshot = queue.snapshot();
    expect(ran).toBe(false);
    expect(snapshot.running.length).toBe(0);
    expect(snapshot.queued.map((job) => job.id)).toContain("huge");
    queue.cancel("huge");
    await pending.catch(() => undefined);
  });

  it("runs a job that fits the budget", async () => {
    const queue = new ResourceAwareQueue(budgetFromHardware({ ramGB: 1 }));
    const value = await queue.enqueue({ id: "small", label: "small render", weight: "heavy", estimatedPeakMB: 300 }, async () => "done");
    expect(value).toBe("done");
  });

  it("runs one heavy job at a time even when two are submitted together", async () => {
    const queue = new ResourceAwareQueue(budgetFromHardware({ ramGB: 8 }));
    const order: string[] = [];
    const first = queue.enqueue({ id: "a", label: "A", weight: "heavy", estimatedPeakMB: 1000 }, async () => {
      order.push("a-start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push("a-end");
      return "a";
    });
    const second = queue.enqueue({ id: "b", label: "B", weight: "heavy", estimatedPeakMB: 1000 }, async () => {
      order.push("b-start");
      return "b";
    });
    await Promise.all([first, second]);
    // B must not start until A has finished.
    expect(order).toEqual(["a-start", "a-end", "b-start"]);
  });
});
