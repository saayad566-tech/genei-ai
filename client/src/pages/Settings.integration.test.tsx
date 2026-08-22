// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { name: "Test Creator", email: "creator@example.com" },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    downloads: {
      listArtifacts: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    customDomains: {
      get: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
      saveAndVerify: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      remove: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

afterEach(() => cleanup());

describe("Settings accessibility and truthful release states", () => {
  it("exposes named navigation controls and a real pending artifact state", () => {
    render(<Settings />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genei AI Desktop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom Domain & PWA" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Genei AI Desktop" }));

    expect(screen.getByText("Desktop installer build pending")).toBeInTheDocument();
    expect(screen.getByText(/complete Windows installer is built on a native Windows environment/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download Genei AI Desktop/i })).not.toBeInTheDocument();
  });
});
