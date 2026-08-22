// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

const artifacts = { value: [] as Array<{ id: string; name: string; version: string; platform: string; fileSize: string; sha256: string; signingState: string; downloadUrl: string }> };

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
        useQuery: () => ({ data: artifacts.value, isLoading: false }),
      },
    },
    customDomains: {
      get: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
      saveAndVerify: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      remove: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

afterEach(() => {
  cleanup();
  artifacts.value = [];
});

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

  it("offers the installer and portable fallback with recovery guidance", () => {
    artifacts.value = [
      { id: "installer", name: "Genei AI Desktop Setup 1.1.3", version: "1.1.3", platform: "win-x64", fileSize: "140 MB", sha256: "installer-sha", signingState: "unsigned", downloadUrl: "/installer.exe" },
      { id: "portable", name: "Genei AI Desktop Portable 1.1.3", version: "1.1.3", platform: "win-x64", fileSize: "140 MB", sha256: "portable-sha", signingState: "unsigned", downloadUrl: "/portable.exe" },
    ];

    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Genei AI Desktop" }));

    expect(screen.getByText("Windows installation help")).toBeInTheDocument();
    expect(screen.getByText("Installer · recommended")).toBeInTheDocument();
    expect(screen.getByText("Portable · no installation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Installer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Portable App" })).toBeInTheDocument();
  });
});
