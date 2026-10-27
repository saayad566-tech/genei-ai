import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicDir = resolve(process.cwd(), "client/public");

describe("Genei PWA contract", () => {
  it("has an installable manifest with Android-safe metadata", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.json"), "utf8")) as {
      display: string;
      start_url: string;
      scope: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#/);

    // Relative, not "/". A web-to-APK packager loads the bundle from a file or a
    // subdirectory; an absolute start_url points at the filesystem root and the app
    // opens blank. This was "/" and it broke conversion.
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");

    // Every icon must be a real PNG file that exists. An SVG-only manifest is rejected by
    // PWABuilder, AppsGeyser and most converters, and a reference to a file that is not
    // there fails at install time rather than at build time.
    const pngs = manifest.icons.filter((icon) => icon.type === "image/png");
    expect(pngs.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("./")).toBe(true);
      const onDisk = resolve(publicDir, icon.src.replace(/^\.\//, ""));
      expect(() => readFileSync(onDisk)).not.toThrow();
    }

    // Play and PWABuilder both require these two exact sizes.
    const sizes = new Set(pngs.map((icon) => icon.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);

    // A maskable icon is what stops Android cropping the logo to a circle badly.
    expect(pngs.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("serves a runtime-configurable backend URL", () => {
    // A packaged bundle has no origin server, so a hardcoded "/api/trpc" resolves to the
    // local file and returns index.html instead of JSON — the app renders and every
    // request fails. config.js lets one file be edited without a rebuild.
    const config = readFileSync(resolve(publicDir, "config.js"), "utf8");
    expect(config).toContain("__GENEI_CONFIG__");
    expect(config).toContain("apiBase");

    const html = readFileSync(resolve(publicDir, "..", "index.html"), "utf8");
    expect(html).toContain("./config.js");
    // And it must load before the bundle, or the bundle reads an undefined config.
    expect(html.indexOf("./config.js")).toBeLessThan(html.indexOf("/src/main.tsx"));
  });

  it("declares a viewport that a WebView cannot pinch-zoom", () => {
    const html = readFileSync(resolve(publicDir, "..", "index.html"), "utf8");
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
    // Without these, pinch-zoom breaks an app-like layout inside a wrapper.
    expect(viewport).toContain("maximum-scale=1.0");
    expect(viewport).toContain("user-scalable=no");
  });

  it("keeps private API and storage traffic out of the offline cache", () => {
    const serviceWorker = readFileSync(resolve(publicDir, "sw.js"), "utf8");
    expect(serviceWorker).toContain("/api/");
    expect(serviceWorker).toContain("/manus-storage/");
    expect(serviceWorker).toContain("genei-shell-v2");
  });
});
