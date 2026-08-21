// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebhookHistoryPanel from "./WebhookHistoryPanel";

const queryState = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: true,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastInput: undefined as unknown,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    globalSettings: {
      getWebhookReceipts: {
        useQuery: (input: unknown) => {
          queryState.lastInput = input;
          return queryState;
        },
      },
    },
  },
}));

describe("WebhookHistoryPanel integration", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    queryState.data = undefined;
    queryState.isLoading = true;
    queryState.isError = false;
    queryState.isFetching = false;
    queryState.lastInput = undefined;
    queryState.refetch.mockClear();
  });

  it("shows an accessible loading state", () => {
    render(<WebhookHistoryPanel />);
    expect(screen.getByText("Loading notification history...")).toBeInTheDocument();
  });

  it("shows guidance when there are no receipts", () => {
    queryState.data = [];
    queryState.isLoading = false;
    render(<WebhookHistoryPanel />);
    expect(screen.getByText("No webhook notifications yet")).toBeInTheDocument();
    expect(screen.getByText(/signed callback/)).toBeInTheDocument();
  });

  it("shows a retry action when history loading fails", () => {
    queryState.isLoading = false;
    queryState.isError = true;
    render(<WebhookHistoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(queryState.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders receipt rows, supports search/status filters, refresh, and a responsive table", () => {
    queryState.data = [{
      id: 7,
      provider: "runway",
      externalTaskId: "task_123",
      eventType: "video.completed",
      payloadHash: "hash_123",
      status: "applied",
      processedAt: new Date("2026-08-21T06:30:00Z"),
      createdAt: new Date("2026-08-21T06:29:00Z"),
    }];
    queryState.isLoading = false;
    const { container } = render(<WebhookHistoryPanel />);

    expect(screen.getByText("task_123")).toBeInTheDocument();
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(container.querySelector("table")?.className).toContain("min-w-[720px]");

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter webhook history by status" }), { target: { value: "failed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search webhook history" }), { target: { value: "runway" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh webhook notification history" }));

    expect(queryState.lastInput).toMatchObject({ search: "runway", status: "failed", limit: 100 });
    expect(queryState.refetch).toHaveBeenCalledTimes(1);
  });
});
