// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppNotificationCenter from "./AppNotificationCenter";

const queryState = vi.hoisted(() => ({ data: [] as Array<{ id: number; title: string; message: string; createdAt: Date }>, isLoading: false, isError: false }));
const markRead = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const invalidate = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ isAuthenticated: true, loading: false }));

vi.mock("@/const", () => ({ getLoginUrl: () => "/login" }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    appNotifications: {
      list: { useQuery: () => queryState },
      markRead: { useMutation: (options: { onSuccess: () => void }) => ({ ...markRead, mutate: (input: unknown) => { markRead.mutate(input); options.onSuccess(); } }) },
    },
    useUtils: () => ({ appNotifications: { list: { invalidate } } }),
  },
}));

vi.mock("wouter", () => ({ Link: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <a href="/director" {...props}>{children}</a> }));

describe("AppNotificationCenter integration", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    queryState.data = [];
    queryState.isLoading = false;
    queryState.isError = false;
    markRead.mutate.mockClear();
    invalidate.mockClear();
    authState.isAuthenticated = true;
    authState.loading = false;
  });

  it("shows a sign-in path instead of private alert data when signed out", () => {
    authState.isAuthenticated = false;
    render(<AppNotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Sign in to view alerts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to Genei AI" })).toHaveAttribute("href", "/login");
  });

  it("explains the empty state", () => {
    render(<AppNotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("You’re all caught up")).toBeInTheDocument();
  });

  it("shows blocked/review alerts and marks an alert read", () => {
    queryState.data = [{ id: 4, title: "Director job needs attention", message: "Job #4 is blocked at continuity_qc.", createdAt: new Date("2026-08-21T07:00:00Z") }];
    render(<AppNotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications, 1 unread/ }));
    expect(screen.getByText("Director job needs attention")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(markRead.mutate).toHaveBeenCalledWith({ id: 4 });
    expect(invalidate).toHaveBeenCalled();
  });
});
