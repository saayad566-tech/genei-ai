import "dotenv/config";
import express from "express";
import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerDirectorWebhookRoutes } from "../webhookRouter";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { liveness, readiness } from "./ops";
import { runtimeConfig } from "../adapters";
import { configureProxyFromEnvironment } from "./network";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Node's fetch ignores HTTP_PROXY unless a dispatcher is installed. Do it before any
  // outbound call so a proxied network behaves as its environment describes.
  const proxy = configureProxyFromEnvironment();
  if (proxy.configured) {
    console.log(`[network] Outbound requests use the proxy at ${proxy.proxy}${proxy.bypass?.length ? ` (bypassing ${proxy.bypass.join(", ")})` : ""}.`);
  } else if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    console.log(`[network] A proxy is configured in the environment but was not installed: ${proxy.reason}`);
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerDirectorWebhookRoutes(app);
  app.get("/api/downloads/:filename", (req, res) => {
    const filename = req.params.filename;
    if (!/^[A-Za-z0-9._-]+\\.(?:exe|zip|sha256|json)$/.test(filename)) {
      res.status(400).json({ error: "Invalid artifact filename" });
      return;
    }
    const filePath = path.join(process.cwd(), "release_binaries", filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Artifact is not published in this environment" });
      return;
    }
    res.download(filePath, filename);
  });
  /**
   * Unauthenticated health probes.
   *
   * These exist because the tRPC health procedures require a session, and a load balancer,
   * container orchestrator or uptime monitor has no credentials. Without these there is no
   * way to ask "is this instance alive?" from outside, which is a production gap rather
   * than a nicety.
   *
   * They are registered BEFORE the static handler so the SPA catch-all does not swallow
   * them and answer with index.html — which is exactly what happened when only the tRPC
   * procedures existed.
   *
   * Deliberately minimal: no version numbers, no paths, no environment detail. A public
   * probe should confirm liveness, not describe the system to an anonymous caller.
   */
  app.get("/healthz", (_req, res) => {
    // Liveness: the process is up and the event loop is turning. Never checks dependencies,
    // because a liveness failure should restart the process, not mask a dependency outage.
    res.status(200).json(liveness());
  });

  app.get("/readyz", (_req, res) => {
    // Readiness: can this instance actually serve work? Reports the real gating conditions.
    //
    // `readiness()` needs the data directory — it checks that the directory is writable and
    // that there is room on the disk. Calling it with no argument threw
    // "Cannot read properties of undefined (reading 'dataDir')", which is exactly the kind
    // of failure a readiness probe must never have: it reported "not ready" for a reason
    // that had nothing to do with readiness.
    try {
      const report = readiness({ dataDir: runtimeConfig().dataDir });
      // Ready only when every gating check passed; a degraded instance should be taken out
      // of rotation, not quietly served.
      const ready = report.state === "healthy" && report.checks.every((check) => check.ok);
      res.status(ready ? 200 : 503).json({ ...report, ready });
    } catch (error) {
      // A probe that throws is not ready, and must say so plainly rather than 500 vaguely.
      res.status(503).json({
        ready: false,
        checks: [{ name: "readiness", ok: false, detail: error instanceof Error ? error.message : "readiness probe failed" }],
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Server running on http://localhost:${actualPort}/`);
  });
}

startServer().catch(console.error);
