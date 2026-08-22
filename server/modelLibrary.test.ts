import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Genei capability library contract", () => {
  it("keeps every catalog entry linked to a non-placeholder official source", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/ModelLibrary.tsx"), "utf8");
    const urls = [...source.matchAll(/sourceUrl: "(https?:[^\"]+)"/g)].map((match) => match[1]);

    expect(urls.length).toBeGreaterThanOrEqual(8);
    expect(urls.every((url) => url.startsWith("https://"))).toBe(true);
    expect(urls.every((url) => !url.includes("example.com"))).toBe(true);
    expect(source).toContain("hardware:");
    expect(source).toContain("license:");
    expect(source).toContain("status:");
  });

  it("does not advertise a universal on-device Android promise for heavy models", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/ModelLibrary.tsx"), "utf8");

    expect(source).toContain("Android-safe routing");
    expect(source).toContain("Android is remote-control only");
    expect(source).toContain("will not claim it runs on every phone");
  });
});
