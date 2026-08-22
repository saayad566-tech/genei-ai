import { describe, expect, it } from "vitest";
import { normalizeStorageKey } from "./_core/storageProxy";

describe("storage proxy compatibility", () => {
  it("repairs the legacy malformed 1.1.8 portable filename", () => {
    expect(normalizeStorageKey("Genei-AI-Desktop-Portable-1.1.1.8_959b1753.exe")).toBe(
      "Genei-AI-Desktop-Portable-1.1.8_959b1753.exe",
    );
  });

  it("does not rewrite canonical or unrelated storage keys", () => {
    expect(normalizeStorageKey("Genei-AI-Desktop-Portable-1.1.8_959b1753.exe")).toBe(
      "Genei-AI-Desktop-Portable-1.1.8_959b1753.exe",
    );
    expect(normalizeStorageKey("some-user-file.txt")).toBe("some-user-file.txt");
  });
});
