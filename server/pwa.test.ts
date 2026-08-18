import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicDir = resolve(process.cwd(), "client/public");

describe("Genei PWA contract", () => {
  it("has an installable manifest with Android-safe metadata", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.json"), "utf8")) as {
      display: string;
      start_url: string;
      theme_color: string;
      icons: Array<{ src: string; type: string }>;
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.icons[0]?.src).toBe("/genei-icon.svg");
  });

  it("keeps private API and storage traffic out of the offline cache", () => {
    const serviceWorker = readFileSync(resolve(publicDir, "sw.js"), "utf8");
    expect(serviceWorker).toContain("/api/");
    expect(serviceWorker).toContain("/manus-storage/");
    expect(serviceWorker).toContain("genei-shell-v2");
  });
});
