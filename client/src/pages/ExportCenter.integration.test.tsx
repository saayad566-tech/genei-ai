// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExportCenter from "./ExportCenter";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn().mockResolvedValue({ id: 1, status: "queued" }) }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, loading: false }) }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    exports: {
      list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutateAsync, isPending: false }) },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

describe("Export Center integration", () => {
  it("queues a vertical BYOH export with the selected format and preset", async () => {
    render(<ExportCenter />);

    fireEvent.click(screen.getByRole("button", { name: /Shorts \/ Reels/ }));
    fireEvent.click(screen.getByRole("button", { name: "MP4 H.264" }));
    fireEvent.click(screen.getByRole("button", { name: /Send to BYOH worker/ }));
    fireEvent.click(screen.getByRole("button", { name: "Queue 1 Format" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      format: "MP4 H.264",
      preset: "shorts",
      publishTarget: "byoh-worker",
    }));
  });
});
