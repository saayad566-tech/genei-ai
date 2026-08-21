// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DagOrchestrationDashboard, { type DirectorData } from "./DagOrchestrationDashboard";

const project: DirectorData = {
  project: { status: "processing", metadata: null },
  scenes: [{ id: 10, sceneKey: "scene-1", sceneIndex: 1, title: "Opening", status: "running", objective: "Establish the path", location: "Neon street" }],
  shots: [{ id: 20, sceneId: 10, shotKey: "shot-1-1", sequenceIndex: 1, status: "generating", prompt: "A character keeps walking", routeUsed: "runway", qaScore: 86, startContinuity: "captured", endContinuity: null }],
  jobs: [{ id: 30, sceneId: 10, shotId: 20, kind: "shot_generation", stage: "shot_generation", status: "blocked", progress: 42, error: null, attempt: 1, updatedAt: new Date() }],
  qc: [{ id: 40, subjectKey: "shot-1-1", passed: true, score: 86, findings: null }],
  dag: {
    nodes: [
      { id: "project-1", kind: "project", label: "Test Project", status: "processing", progress: 42 },
      { id: "scene-10", kind: "scene", label: "scene-1 · Opening", status: "running", progress: 42, sceneId: 10 },
      { id: "shot-20", kind: "shot", label: "shot-1-1", status: "generating", progress: 42, sceneId: 10, shotId: 20 },
      { id: "job-30", kind: "job", label: "shot_generation · shot_generation", status: "blocked", progress: 42, sceneId: 10, shotId: 20, jobId: 30 },
    ],
    edges: [
      { id: "edge-project-10", source: "project-1", target: "scene-10", kind: "contains" },
      { id: "edge-shot-job-20-30", source: "shot-20", target: "job-30", kind: "execution" },
    ],
  },
};

describe("DAG orchestration dashboard", () => {
  it("renders live progress and exposes shot details and retry action", () => {
    const onRetry = vi.fn();
    const onSaveBoundary = vi.fn();
    render(<DagOrchestrationDashboard project={project} onRetry={onRetry} onSaveBoundary={onSaveBoundary} />);

    expect(screen.getByText("Orchestration Graph")).toBeInTheDocument();
    expect(screen.getAllByText("scene-1 · Opening").length).toBeGreaterThan(0);
    expect(screen.getAllByText("shot-1-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42%").length).toBeGreaterThan(0);
    expect(screen.getByText("Dependency topology")).toBeInTheDocument();
    expect(screen.getByText(/2 directed edges/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked path:/)).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry shot-1-1" }));
    expect(onRetry).toHaveBeenCalledWith(20);

    fireEvent.click(screen.getAllByRole("button", { name: /shot-1-1/ })[0]);
    expect(screen.getByText("Route: runway")).toBeInTheDocument();
    expect(screen.getByText("Start boundary: captured")).toBeInTheDocument();
    expect(screen.getByText("Continuity Inspector · shot-1-1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Action phase start" }), { target: { value: "walking" } });
    fireEvent.click(screen.getByRole("button", { name: "Save boundary review" }));
    expect(onSaveBoundary).toHaveBeenCalledWith(20, expect.objectContaining({ status: "needs_review" }));
  });
});
