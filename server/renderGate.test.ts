import { describe, expect, it } from "vitest";
import { submitRuntimeJob } from "./runtimeJobs";
import type { ContinuityProject } from "@shared/continuity";

/**
 * The continuity gate, enforced at job submission.
 *
 * The gate existed as a procedure but was never applied to an actual render, which made it a
 * report nobody had to read. These tests assert the enforcement: a contradictory scene list
 * stops a video job before the adapter runs, and the refusal is recorded rather than thrown.
 */

const consistent = (): ContinuityProject => ({
  characters: [{ id: "aria", name: "Aria", wardrobe: ["coat"] }],
  locations: [{ id: "outpost", name: "Outpost" }],
  props: [],
  scenes: [
    {
      id: "s1",
      index: 1,
      time: { label: "day 1", order: 1 },
      locationId: "outpost",
      characters: [{ characterId: "aria", wardrobe: ["coat"] }],
      props: [],
    },
  ],
});

const contradictory = (): ContinuityProject => ({
  ...consistent(),
  scenes: [
    {
      id: "s1",
      index: 1,
      time: { label: "day 1", order: 1 },
      locationId: "outpost",
      characters: [{ characterId: "ghost", wardrobe: [] }], // not in the cast
      props: [],
    },
  ],
});

describe("render gate at submission", () => {
  it("blocks a video job on an error-severity finding, and says which", async () => {
    const job = await submitRuntimeJob({
      taskType: "video",
      payload: { prompt: "test" },
      continuity: { project: contradictory() },
    });

    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/Continuity gate blocked/i);
    expect(job.error).toContain("UNKNOWN_CHARACTER");
  });

  it("records the refusal as a job rather than throwing, so it is auditable", async () => {
    // A caller inspecting the job list should see why nothing was rendered.
    const job = await submitRuntimeJob({
      taskType: "video",
      payload: {},
      continuity: { project: contradictory() },
    });
    expect(job.id).toMatch(/^job-/);
    expect(job.status).toBe("failed");
  });

  it("allows a consistent project through the gate", async () => {
    const job = await submitRuntimeJob({
      taskType: "video",
      payload: { prompt: "test" },
      continuity: { project: consistent() },
    });
    // It may still fail for want of a generator, but NOT because of the gate.
    expect(job.error ?? "").not.toMatch(/Continuity gate blocked/i);
  });

  it("honours an override and lets the render proceed", async () => {
    const job = await submitRuntimeJob({
      taskType: "video",
      payload: {},
      continuity: { project: contradictory(), override: true, overrideReason: "the ghost is intentional" },
    });
    expect(job.error ?? "").not.toMatch(/Continuity gate blocked/i);
  });

  it("does not gate a non-video task — probing a file cannot contradict a story", async () => {
    const job = await submitRuntimeJob({
      taskType: "probe",
      payload: { path: "/nonexistent.mp4" },
      continuity: { project: contradictory() },
    });
    expect(job.error ?? "").not.toMatch(/Continuity gate blocked/i);
  });

  it("does not gate when no project is supplied — absent is not the same as passing", async () => {
    const job = await submitRuntimeJob({ taskType: "video", payload: {} });
    expect(job.error ?? "").not.toMatch(/Continuity gate blocked/i);
  });
});
