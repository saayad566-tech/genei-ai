import { describe, expect, it, vi } from "vitest";
import { getLoginUrl, hasLoginPortal } from "./const";

// Regression guard: getLoginUrl is evaluated as a default argument inside useAuth,
// so throwing from here crashed every screen that reads auth state whenever no OAuth
// portal was configured.
describe("getLoginUrl", () => {
  it("never throws when no portal is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => getLoginUrl()).not.toThrow();
    expect(getLoginUrl()).toBe("/settings");
    warn.mockRestore();
  });

  it("always returns a usable string", () => {
    const value = getLoginUrl();
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  });

  it("reports whether a hosted portal exists, so callers know not to navigate", () => {
    // In this environment no portal is configured, so callers must not redirect.
    expect(hasLoginPortal()).toBe(false);
  });
});
