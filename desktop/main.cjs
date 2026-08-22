const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_NAME = "Genei AI Desktop";
const isDevelopment = !app.isPackaged;
// The desktop UI must start even when a machine has no usable display driver;
// hardware acceleration for AI workloads is detected by the embedded probe.
app.commandLine.appendSwitch("disable-gpu");
let mainWindow;
let serverProcess;
let sidecarProcess;
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

function sidecarEntry() {
  const executable = process.platform === "win32" ? "GeneiAI-Director.exe" : "GeneiAI-Director";
  return path.join(runtimeRoot(), executable);
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
}

function parseServerPort(line) {
  const match = line.match(/Server running on http:\/\/localhost:(\d+)/i);
  return match ? Number(match[1]) : null;
}

function startLocalServer() {
  if (!fs.existsSync(serverEntry())) {
    throw new Error(`Genei server bundle was not found at ${serverEntry()}`);
  }

  const childEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: "0",
    GENEI_DESKTOP: "1",
    GENEI_DESKTOP_DATA_DIR: app.getPath("userData"),
  };

  serverProcess = spawn(process.execPath, [serverEntry()], {
    cwd: applicationRoot(),
    env: { ...childEnv, ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const inspect = (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[Genei server] ${text}`);
    for (const line of text.split(/\r?\n/)) {
      const port = parseServerPort(line);
      if (port) {
        serverPort = port;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://localhost:${serverPort}/`);
        }
      }
    }
  };

  serverProcess.stdout.on("data", inspect);
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(`[Genei server] ${String(chunk)}`));
  serverProcess.on("error", (error) => console.error("[Genei server] process error", error));
  serverProcess.on("exit", (code, signal) => {
    serverProcess = null;
    if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(PRODUCT_NAME, `The embedded workspace stopped unexpectedly (code ${code ?? signal ?? "unknown"}).`);
    }
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
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ source: "desktop-host", status: "probe-timeout", message: "Hardware detection timed out; cloud tools remain available." });
    }, 10_000);

    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => process.stderr.write(`[Genei hardware] ${String(chunk)}`));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ source: "desktop-host", status: "probe-error", message: "Hardware detection could not start; cloud tools remain available." });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(output.trim());
        resolve({ ...parsed, source: "embedded-sidecar", status: code === 0 ? "ready" : "probe-error" });
      } catch {
        resolve({ source: "desktop-host", status: "probe-error", message: "Hardware detection returned no readable profile; cloud tools remain available." });
      }
    });
  });
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
      mainWindow.focus();
    }
  });

  await app.whenReady();
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
  ipcMain.handle("desktop:open-data-directory", () => {
    return shell.openPath(app.getPath("userData"));
  });

  createWindow();
  try {
    startLocalServer();
    hardwareProfile = await probeHardware();
  } catch (error) {
    dialog.showErrorBox(PRODUCT_NAME, error instanceof Error ? error.message : "The embedded Genei workspace could not start.");
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

const { shell } = require("electron");
bootstrap();

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (sidecarProcess) sidecarProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
  if (sidecarProcess) sidecarProcess.kill();
});
