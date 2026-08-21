/** @vitest-environment jsdom */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamWorkspace from "./TeamWorkspace";
import AutomationCenter from "./AutomationCenter";
import Marketplace from "./Marketplace";
import Monetization from "./Monetization";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

afterEach(() => cleanup());

describe("platform truthfulness audit surfaces", () => {
  it("labels Team Workspace as preview and avoids fabricated invite identity", () => {
    render(<TeamWorkspace />);
    expect(screen.getByText("Preview — invitations not connected")).toBeInTheDocument();
    expect(screen.getByText("Private invite link will appear here after team invitations are enabled.")).toBeInTheDocument();
    expect(screen.queryByText("owner@genei.ai")).not.toBeInTheDocument();
  });

  it("labels Automation Center as preview and exposes an honest empty execution state", () => {
    render(<AutomationCenter />);
    expect(screen.getByText("Preview — execution and saving not connected")).toBeInTheDocument();
    expect(screen.getByText("No executable workflows yet")).toBeInTheDocument();
    expect(screen.getByText(/run history will appear here/)).toBeInTheDocument();
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
