const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_NAME = "Genei AI Desktop";
const isDevelopment = !app.isPackaged;
const STARTUP_TIMEOUT_MS = 30_000;
const SERVER_PROBE_TIMEOUT_MS = 1_500;

// The desktop UI must start even when a machine has no usable display driver;
// hardware acceleration for AI workloads is detected by the embedded probe.
app.commandLine.appendSwitch("disable-gpu");

let mainWindow;
let serverProcess;
let hardwareProbeProcess;
let serverPort;
let hardwareProfile = null;

function applicationRoot() {
  return isDevelopment ? path.resolve(__dirname, "..") : app.getAppPath();
}

function runtimeRoot() {
  return isDevelopment ? path.join(applicationRoot(), "runtime") : path.join(process.resourcesPath, "runtime");
}

function serverEntry() {
  return path.join(applicationRoot(), "dist", "index.js");
}

function desktopWorkingDirectory() {
  if (isDevelopment) return applicationRoot();
  // app.getAppPath() points inside app.asar and is not a valid Windows spawn cwd.
  // Use a real filesystem directory for the embedded child process instead.
  const candidates = [process.resourcesPath, app.getPath("userData"), process.cwd()];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || process.cwd();
}

function validatePackagedLayout() {
  if (isDevelopment) return;
  const required = [
    ["desktop executable", process.execPath],
    ["embedded server bundle", serverEntry()],
    ["secure preload bridge", path.join(__dirname, "preload.cjs")],
  ];
  const missing = required.filter(([, candidate]) => !candidate || !fs.existsSync(candidate));
  if (missing.length > 0) {
    throw new Error(`Installed Genei AI files are incomplete: ${missing.map(([label, candidate]) => `${label} (${candidate})`).join("; ")}`);
  }
}

function sidecarEntry() {
  const executable = process.platform === "win32" ? "GeneiAI-Director.exe" : "GeneiAI-Director";
  return path.join(runtimeRoot(), executable);
}

function writeDiagnostic(message) {
  try {
    const logDirectory = app.getPath("userData");
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(path.join(logDirectory, "desktop-startup.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never prevent the application from showing its error state.
  }
}

function loadingPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${PRODUCT_NAME}</title><style>html,body{margin:0;height:100%;background:#07070b;color:#f7f5ff;font-family:Segoe UI,system-ui,sans-serif}body{display:grid;place-items:center}.card{width:min(520px,calc(100vw - 48px));padding:32px;border:1px solid #49327d;border-radius:20px;background:linear-gradient(145deg,#151022,#09090d);box-shadow:0 0 80px #542bc522}h1{font-size:24px;margin:0 0 10px}p{color:#aaa3b9;line-height:1.6;margin:0}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#a855f7;box-shadow:0 0 18px #a855f7;margin-right:10px;animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.35}}</style></head><body><div class="card"><h1><span class="dot"></span>Starting Genei AI Desktop</h1><p>Preparing the embedded workspace and checking this computer. No separate runner or hardware utility is required.</p></div></body></html>`;
}

function errorPage(message) {
  const safeMessage = String(message).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\": "&#92;", '"': "&quot;" })[character]);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${PRODUCT_NAME} — Startup issue</title><style>html,body{margin:0;height:100%;background:#07070b;color:#f7f5ff;font-family:Segoe UI,system-ui,sans-serif}body{display:grid;place-items:center}.card{width:min(620px,calc(100vw - 48px));padding:32px;border:1px solid #7f1d3a;border-radius:20px;background:#170b12;box-shadow:0 0 80px #7f1d3a33}h1{font-size:24px;margin:0 0 10px}p{color:#d6c6ce;line-height:1.6}code{display:block;margin-top:18px;padding:12px;border-radius:10px;background:#09090d;color:#fca5a5;white-space:pre-wrap;word-break:break-word;font:12px Consolas,monospace}</style></head><body><div class="card"><h1>Genei AI could not start</h1><p>Close any older Genei AI window and try again. If the installer is blocked, use the portable Genei AI Desktop download from the project page.</p><code>${safeMessage}</code></div></body></html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#07070b",
    title: PRODUCT_NAME,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingPage())}`);
}

function parseServerPort(line) {
  const match = line.match(/Server running on http:\/\/localhost:(\d+)\/?/i);
  const port = match ? Number(match[1]) : null;
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function checkLocalServer(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: SERVER_PROBE_TIMEOUT_MS }, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode < 500) {
        resolve();
      } else {
        reject(new Error(`Embedded workspace returned HTTP ${response.statusCode ?? "unknown"}.`));
      }
    });
    request.on("timeout", () => request.destroy(new Error("Local workspace readiness request timed out.")));
    request.on("error", reject);
  });
}

function startLocalServer() {
  try {
    validatePackagedLayout();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0",
      GENEI_DESKTOP: "1",
      GENEI_DESKTOP_DATA_DIR: app.getPath("userData"),
    };
    let outputBuffer = "";
    let settled = false;
    let readinessPort = null;

    const finish = (error, port) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      if (error) {
        writeDiagnostic(`Server startup failed: ${error.message}`);
        if (serverProcess) {
          serverProcess.kill();
          serverProcess = null;
        }
        reject(error);
      } else {
        serverPort = port;
        resolve(port);
      }
    };

    const startupTimer = setTimeout(() => {
      finish(new Error("The embedded workspace did not become ready within 30 seconds."));
    }, STARTUP_TIMEOUT_MS);

    serverProcess = spawn(process.execPath, [serverEntry()], {
      cwd: desktopWorkingDirectory(),
      env: { ...childEnv, ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const inspect = (chunk) => {
      const text = String(chunk);
      writeDiagnostic(`[Genei server] ${text.trim()}`);
      process.stdout.write(`[Genei server] ${text}`);
      outputBuffer += text;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const port = parseServerPort(line);
        if (port && !readinessPort) {
          readinessPort = port;
          checkLocalServer(port)
            .then(() => finish(null, port))
            .catch((error) => {
              writeDiagnostic(`Readiness probe for port ${port} failed: ${error.message}`);
            });
        }
      }
    };

    serverProcess.stdout.on("data", inspect);
    serverProcess.stderr.on("data", (chunk) => {
      const text = String(chunk);
      writeDiagnostic(`[Genei server stderr] ${text.trim()}`);
      process.stderr.write(`[Genei server] ${text}`);
    });
    serverProcess.on("error", (error) => finish(error));
    serverProcess.on("exit", (code, signal) => {
      const message = `The embedded workspace stopped unexpectedly (code ${code ?? signal ?? "unknown"}).`;
      serverProcess = null;
      if (!settled) finish(new Error(message));
      else if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox(PRODUCT_NAME, message);
    });
  });
}

function probeHardware() {
  const executable = sidecarEntry();
  if (!fs.existsSync(executable)) {
    return Promise.resolve({
      source: "desktop-host",
      status: "bundled-sidecar-missing",
      message: "The internal hardware probe is not present in this development build.",
      platform: process.platform,
      arch: process.arch,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(executable, ["--probe"], {
      cwd: app.getPath("userData"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    hardwareProbeProcess = child;
    let output = "";
    const finish = (profile) => {
      if (hardwareProbeProcess === child) hardwareProbeProcess = null;
      resolve(profile);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ source: "desktop-host", status: "probe-timeout", message: "Hardware detection timed out; cloud tools remain available." });
    }, 10_000);

    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => process.stderr.write(`[Genei hardware] ${String(chunk)}`));
    child.on("error", () => {
      clearTimeout(timer);
      finish({ source: "desktop-host", status: "probe-error", message: "Hardware detection could not start; cloud tools remain available." });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(output.trim());
        finish({ ...parsed, source: "embedded-sidecar", status: code === 0 ? "ready" : "probe-error" });
      } catch {
        finish({ source: "desktop-host", status: "probe-error", message: "Hardware detection returned no readable profile; cloud tools remain available." });
      }
    });
  });
}

async function showStartupError(error) {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  writeDiagnostic(`Fatal startup error: ${message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(message))}`);
    mainWindow.show();
  }
}

async function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  await app.whenReady();
  app.setAppUserModelId("ai.genei.desktop");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["media"].includes(permission));
  });

  ipcMain.handle("desktop:status", async () => ({
    product: PRODUCT_NAME,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    serverPort,
    hardware: hardwareProfile,
    dataDirectory: app.getPath("userData"),
  }));
  ipcMain.handle("desktop:refresh-hardware", async () => {
    hardwareProfile = await probeHardware();
    return hardwareProfile;
  });
  ipcMain.handle("desktop:open-data-directory", () => shell.openPath(app.getPath("userData")));

  createWindow();
  try {
    const port = await startLocalServer();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    }
    // Hardware detection must never delay the first usable workspace.
    hardwareProfile = await probeHardware();
  } catch (error) {
    await showStartupError(error);
    dialog.showErrorBox(PRODUCT_NAME, error instanceof Error ? error.message : "The embedded Genei workspace could not start.");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

bootstrap().catch((error) => {
  writeDiagnostic(`Unhandled bootstrap error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  dialog.showErrorBox(PRODUCT_NAME, error instanceof Error ? error.message : "The desktop application could not start.");
  app.quit();
});

function stopChild(child) {
  if (child && !child.killed) child.kill();
}

app.on("window-all-closed", () => {
  stopChild(serverProcess);
  stopChild(hardwareProbeProcess);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopChild(serverProcess);
  stopChild(hardwareProbeProcess);
});
