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
