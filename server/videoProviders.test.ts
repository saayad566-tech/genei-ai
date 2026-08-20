import { describe, expect, it, vi } from "vitest";
import { checkVideoProviderHealth, VIDEO_PROVIDER_CATALOG } from "./videoProviders";

describe("video provider adapters", () => {
  it("advertises the supported video provider catalog", () => {
    expect(VIDEO_PROVIDER_CATALOG.map((provider) => provider.id)).toEqual(["runway", "pika", "kling", "heygen"]);
    expect(VIDEO_PROVIDER_CATALOG.every((provider) => provider.capabilities.length > 0)).toBe(true);
  });

  it("uses the official HeyGen account endpoint without exposing the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkVideoProviderHealth("heygen", "secret-key");

    expect(result.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledWith("https://api.heygen.com/v3/users/me", expect.objectContaining({
      headers: { "X-Api-Key": "secret-key" },
    }));
    vi.unstubAllGlobals();
  });

  it("uses the official Pika billing balance endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkVideoProviderHealth("pika", "secret-key");

    expect(result.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledWith("https://api.dev.pika.art/billing/balance", expect.objectContaining({
      headers: { "X-API-Key": "secret-key" },
    }));
    vi.unstubAllGlobals();
  });

  it("uses the documented non-billable Runway task retrieval probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkVideoProviderHealth("runway", "secret-key");

    expect(result.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://api.dev.runwayml.com/v1/tasks/"), expect.objectContaining({
      headers: { Authorization: "Bearer secret-key", "X-Runway-Version": "2024-11-06" },
    }));
    vi.unstubAllGlobals();
  });
});
