import { describe, expect, it } from "vitest";
import express from "express";
import { registerDirectorWebhookRoutes } from "./webhookRouter";

describe("Director signed webhook receiver", () => {
  it("registers webhook route without error", () => {
    const app = express();
    registerDirectorWebhookRoutes(app);
    expect(app).toBeDefined();
  });
});
