/** @vitest-environment jsdom */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamWorkspace from "./TeamWorkspace";
import AutomationCenter from "./AutomationCenter";
import Marketplace from "./Marketplace";
import Monetization from "./Monetization";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), message: vi.fn() } }));

// Automation Center is connected now, so it reads real queries. Stub them, and return
// empty lists so the honest empty states are what get asserted.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflows: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      save: { useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) },
      execute: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    projects: { list: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}));

afterEach(() => cleanup());

describe("platform truthfulness audit surfaces", () => {
  it("labels Team Workspace as preview and avoids fabricated invite identity", () => {
    render(<TeamWorkspace />);
    expect(screen.getByText("Preview — invitations not connected")).toBeInTheDocument();
    expect(screen.getByText("Private invite link will appear here after team invitations are enabled.")).toBeInTheDocument();
    expect(screen.queryByText("owner@genei.ai")).not.toBeInTheDocument();
  });

  it("states that Automation Center saves and queues for real, with an honest empty state", () => {
    render(<AutomationCenter />);
    // The page is connected now: workflows are stored and queued as durable jobs. It
    // must not claim more than that, and must not claim less.
    expect(screen.getByText("Workflows save to your account and queue as durable jobs")).toBeInTheDocument();
    expect(screen.queryByText("Preview — execution and saving not connected")).not.toBeInTheDocument();
    expect(screen.getByText("No workflows saved yet")).toBeInTheDocument();
    expect(screen.getByText(/stored on your account and can be queued/)).toBeInTheDocument();
  });

  it("removes fabricated Marketplace ratings and download counters", () => {
    render(<Marketplace />);
    expect(screen.getByText("Preview catalog — purchases and downloads not connected")).toBeInTheDocument();
    expect(screen.getAllByText("View preview")).toHaveLength(8);
    expect(screen.queryByText("4.9")).not.toBeInTheDocument();
    expect(screen.queryByText("12.4K")).not.toBeInTheDocument();
  });

  it("labels Monetization metrics as unavailable until billing is connected", () => {
    render(<Monetization />);
    expect(screen.getByText("Preview — billing and payout data not connected")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText(/Example pricing — connect billing in Settings/)).toBeInTheDocument();
  });
});
