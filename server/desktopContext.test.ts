import { afterEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest } = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest },
}));

import { createContext } from "./_core/context";

describe("desktop-local context", () => {
  afterEach(() => {
    delete process.env.GENEI_DESKTOP;
    authenticateRequest.mockReset();
  });

  it("provides a local guest identity only in the embedded desktop server", async () => {
    authenticateRequest.mockRejectedValue(new Error("no hosted session"));
    process.env.GENEI_DESKTOP = "1";

    const context = await createContext({ req: {} as never, res: {} as never });

    expect(context.user).toMatchObject({
      id: 0,
      openId: "desktop-local-guest",
      loginMethod: "desktop-local",
      role: "user",
    });
  });

  it("does not grant the local guest identity to a hosted request", async () => {
    authenticateRequest.mockRejectedValue(new Error("no hosted session"));

    const context = await createContext({ req: {} as never, res: {} as never });

    expect(context.user).toBeNull();
  });
});
