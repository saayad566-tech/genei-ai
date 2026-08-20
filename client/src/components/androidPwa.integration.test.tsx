// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPwaButton } from "./InstallPwaButton";
import { ModelRuntimeStatus } from "./ModelRuntimeStatus";
import ImageGenerator from "@/pages/ImageGenerator";
import { runnerCapabilitySummary } from "@/pages/ApiIntegrations";
import { VoicePromptButton } from "./VoicePromptButton";

const { generateImageMutation, importRemoteMutation } = vi.hoisted(() => ({
  generateImageMutation: { mutateAsync: vi.fn() },
  importRemoteMutation: { mutateAsync: vi.fn() },
}));

const recognitionInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onresult: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}> = [];

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    ai: {
      capabilities: {
        useQuery: () => ({
          data: { models: [{ id: "primary" }, { id: "fallback" }] },
          isLoading: false,
          isError: false,
        }),
      },
      generateImage: {
        useMutation: () => generateImageMutation,
      },
    },
    assets: {
      importRemote: {
        useMutation: () => importRemoteMutation,
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  cleanup();
  recognitionInstances.length = 0;
  generateImageMutation.mutateAsync.mockReset();
  importRemoteMutation.mutateAsync.mockReset();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

describe("Android/PWA frontend flows", () => {
  it("renders live model capability status for an authenticated Android session", () => {
    render(<ModelRuntimeStatus />);

    expect(screen.getByText("Android-ready server routing")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Supported")).toBeInTheDocument();
  });

  it("recovers from a generation failure and then saves/downloads the generated image", async () => {
    generateImageMutation.mutateAsync
      .mockRejectedValueOnce(new Error("Model timed out"))
      .mockResolvedValueOnce({ url: "https://cdn.example/genei.png" });
    importRemoteMutation.mutateAsync.mockResolvedValue({ id: 42, url: "/manus-storage/genei.png" });
    const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ImageGenerator />);
    fireEvent.change(screen.getByPlaceholderText(/futuristic neon city/i), { target: { value: "A cinematic Android launch scene" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Image" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Model timed out");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByAltText("A cinematic Android launch scene")).toHaveAttribute("src", "https://cdn.example/genei.png");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(importRemoteMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      type: "image",
      remoteUrl: "https://cdn.example/genei.png",
    })));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    downloadSpy.mockRestore();
  });

  it("summarizes structured BYOH hardware metadata for the dashboard", () => {
    expect(runnerCapabilitySummary(JSON.stringify({ tools: ["ffmpeg", "gpu"], hardware: { gpu_count: 1, ram_mb: 65536 } }))).toBe("2 tools · 1 GPU · 64 GB RAM");
  });

  it("captures a voice transcript and exposes a stop control", () => {
    const transcriptHandler = vi.fn();
    const FakeRecognition = vi.fn().mockImplementation(() => {
      const recognition = {
        continuous: false,
        interimResults: false,
        lang: "en-US",
        start: vi.fn(),
        stop: vi.fn(),
        onresult: null,
        onend: null,
        onerror: null,
      };
      recognitionInstances.push(recognition);
      return recognition;
    });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });

    render(<VoicePromptButton onTranscript={transcriptHandler} />);
    const startButton = screen.getByRole("button", { name: "Use voice input" });
    fireEvent.click(startButton);
    expect(recognitionInstances[0]?.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop voice input" })).toBeInTheDocument();

    act(() => {
      recognitionInstances[0]?.onresult?.({
        results: { 0: { 0: { transcript: "a cinematic neon city" } } },
      } as unknown as Event);
    });
    expect(transcriptHandler).toHaveBeenCalledWith("a cinematic neon city");

    fireEvent.click(screen.getByRole("button", { name: "Stop voice input" }));
    expect(recognitionInstances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it("reveals and invokes the Android PWA install prompt when the browser offers it", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event("beforeinstallprompt");
    Object.defineProperties(installEvent, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
    });

    render(<InstallPwaButton />);
    expect(screen.queryByRole("button", { name: "Install Genei AI app" })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(installEvent);
    });
    const installButton = await screen.findByRole("button", { name: "Install Genei AI app" });
    fireEvent.click(installButton);
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });
});
