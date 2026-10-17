const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_NAME = "Genei AI Desktop";
const PUBLISHER_NAME = "SaayadTech";
const isDevelopment = !app.isPackaged;
const STARTUP_TIMEOUT_MS = 30_000;
// Independent backstop: the loading screen must never be able to persist forever.
const STARTUP_HARD_DEADLINE_MS = 45_000;
const SERVER_PROBE_TIMEOUT_MS = 1_500;

// Keep hardware acceleration ON. Chromium already falls back to software
// rendering when a machine has no usable display driver, but disabling the GPU
// unconditionally forced the entire React UI onto the CPU — which is what made
// the window stutter and freeze on ordinary laptops. The switch below is now an
// explicit escape hatch for the rare driver that crashes the GPU process.
if (process.env.GENEI_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("disable-gpu");
}

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
  if (isDevelopment) return path.join(applicationRoot(), "dist", "index.js");
  const unpackedEntry = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.js");
  return fs.existsSync(unpackedEntry) ? unpackedEntry : path.join(applicationRoot(), "dist", "index.js");
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

// Diagnostics are buffered and flushed asynchronously. The previous version used
// fs.appendFileSync on every single line the embedded server printed, which
// blocked the Electron main thread and made the whole window stutter. Nothing
// below may use a synchronous filesystem API.
const DIAGNOSTIC_FLUSH_MS = 400;
const DIAGNOSTIC_MAX_BYTES = 1_500_000;
let diagnosticQueue = [];
let diagnosticTimer = null;

function flushDiagnostics() {
  diagnosticTimer = null;
  if (diagnosticQueue.length === 0) return;
  const payload = diagnosticQueue.join("");
  diagnosticQueue = [];
  try {
    const logDirectory = app.getPath("userData");
    fs.mkdirSync(logDirectory, { recursive: true });
    const logPath = path.join(logDirectory, "desktop-startup.log");
    fs.stat(logPath, (statError, stats) => {
      if (!statError && stats && stats.size > DIAGNOSTIC_MAX_BYTES) {
        fs.writeFile(logPath, payload, () => {});
      } else {
        fs.appendFile(logPath, payload, () => {});
      }
    });
  } catch {
    // Diagnostics must never prevent the application from showing its error state.
  }
}

function writeDiagnostic(message) {
  try {
    diagnosticQueue.push(`${new Date().toISOString()} ${message}\n`);
    if (diagnosticQueue.length > 400) diagnosticQueue.splice(0, diagnosticQueue.length - 400);
    if (!diagnosticTimer) {
      diagnosticTimer = setTimeout(flushDiagnostics, DIAGNOSTIC_FLUSH_MS);
      if (typeof diagnosticTimer.unref === "function") diagnosticTimer.unref();
    }
  } catch {
    // Never let logging break startup.
  }
}

function loadingPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${PRODUCT_NAME}</title><style>html,body{margin:0;height:100%;background:#07070b;color:#f7f5ff;font-family:Segoe UI,system-ui,sans-serif}body{display:grid;place-items:center}.card{width:min(520px,calc(100vw - 48px));padding:32px;border:1px solid #49327d;border-radius:20px;background:linear-gradient(145deg,#151022,#09090d);box-shadow:0 0 80px #542bc522}h1{font-size:24px;margin:0 0 10px}p{color:#aaa3b9;line-height:1.6;margin:0}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#a855f7;box-shadow:0 0 18px #a855f7;margin-right:10px;animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.35}}</style></head><body><div class="card"><h1><span class="dot"></span>Starting Genei AI Desktop</h1><p>Preparing the embedded workspace and checking this computer. No separate runner or hardware utility is required.</p></div></body></html>`;
}

function errorPage(message) {
  const safeMessage = String(message).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\": "&#92;", '"': "&quot;" })[character]);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${PRODUCT_NAME} — Startup issue</title><style>html,body{margin:0;height:100%;background:#07070b;color:#f7f5ff;font-family:Segoe UI,system-ui,sans-serif}body{display:grid;place-items:center}.card{width:min(620px,calc(100vw - 48px));padding:32px;border:1px solid #7f1d3a;border-radius:20px;background:#170b12;box-shadow:0 0 80px #7f1d3a33}h1{font-size:24px;margin:0 0 10px}p{color:#d6c6ce;line-height:1.6}code{display:block;margin-top:18px;padding:12px;border-radius:10px;background:#09090d;color:#fca5a5;white-space:pre-wrap;word-break:break-word;font:12px Consolas,monospace}</style></head><body><div class="card"><h1>Genei AI could not start</h1><p>Close any older Genei AI window and try again. If the installer is blocked, use the portable Genei AI Desktop download from the project page.</p><code>${safeMessage}</code></div></body></html>`;
}

// ── Terms and Conditions ──────────────────────────────────────────────────
// The first run requires explicit acceptance before any workspace starts, and
// the same terms are attached to the Windows installer as its licence page.
const TERMS_VERSION = "2026-10-17";

const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of these Terms",
    body: `Genei AI Desktop is published by ${PUBLISHER_NAME}. By installing, launching or using the application you agree to these Terms and Conditions. If you do not agree, decline below and the application will close, and you should uninstall it.`,
  },
  {
    title: "2. What Genei AI Desktop is",
    body: "Genei AI Desktop is an independent platform for autonomous directors. It lets you plan, direct and assemble video productions by routing work across multiple AI models. It is an independent product: it is not affiliated with, endorsed by, or sponsored by any AI model provider whose models it can call.",
  },
  {
    title: "3. Licence to use",
    body: `Subject to these Terms, ${PUBLISHER_NAME} grants you a personal, non-exclusive, non-transferable licence to install and use Genei AI Desktop on devices you control, for your own or your organisation's internal productions.`,
  },
  {
    title: "4. Your content and AI output",
    body: "You keep ownership of the material you supply, and of the output you generate, subject to the terms of whichever AI model produced it. You are responsible for holding the rights needed to use your input material, and for reviewing and clearing any generated output before you publish or distribute it.",
  },
  {
    title: "5. Third-party AI models and API keys",
    body: "The application can call AI models through your own provider accounts and API keys. Those calls are governed by the provider's own terms, pricing and usage limits, which you are responsible for. Keys you enter are encrypted on your device and are never shared by this application with anyone other than the provider you configured.",
  },
  {
    title: "6. Acceptable use",
    body: "You must not use Genei AI Desktop to create or distribute material that is unlawful, infringing, defamatory, or that sexualises minors, nor to impersonate a real person in a way that is intended to deceive, nor to break the terms of service of any provider you connect.",
  },
  {
    title: "7. No warranty",
    body: 'Genei AI Desktop is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy of AI output, or uninterrupted operation. AI output can be wrong, incomplete or unsuitable, and must be reviewed by a human.',
  },
  {
    title: "8. Limitation of liability",
    body: `To the fullest extent permitted by law, ${PUBLISHER_NAME} is not liable for indirect, incidental or consequential loss, loss of profit, loss of data, or loss arising from AI-generated output or from any third-party model, service or API key.`,
  },
  {
    title: "9. Privacy and local data",
    body: "The application runs a workspace on your own device and stores its data locally. Information is sent to an AI provider only when you configure a provider and request work that uses it.",
  },
  {
    title: "10. Updates and changes",
    body: "These Terms may be updated with a new release. A new version of the Terms is presented for acceptance the next time you launch after it changes.",
  },
  {
    title: "11. Termination",
    body: `You may stop using Genei AI Desktop at any time by uninstalling it. This licence ends automatically if you breach these Terms.`,
  },
  {
    title: "12. Governing law and contact",
    body: `These Terms are governed by the laws of India. Questions about these Terms, or about ${PUBLISHER_NAME}, should be raised with the publisher through the project's published contact channel.`,
  },
];

function termsFilePath() {
  return path.join(app.getPath("userData"), "terms-acceptance.json");
}

function hasAcceptedTerms() {
  try {
    const record = JSON.parse(fs.readFileSync(termsFilePath(), "utf8"));
    return Boolean(record) && record.version === TERMS_VERSION;
  } catch {
    return false;
  }
}

function recordTermsAcceptance() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(
      termsFilePath(),
      JSON.stringify({ product: PRODUCT_NAME, publisher: PUBLISHER_NAME, version: TERMS_VERSION, acceptedAt: new Date().toISOString() }, null, 2),
    );
  } catch {
    // If acceptance cannot be written the terms are simply shown again next launch.
  }
}

function termsPage() {
  const sections = TERMS_SECTIONS.map(
    (section) => `<h2>${section.title}</h2><p>${section.body}</p>`,
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${PRODUCT_NAME} — Terms and Conditions</title><style>html,body{margin:0;height:100%;background:#07070b;color:#f7f5ff;font-family:Segoe UI,system-ui,sans-serif}body{display:flex;flex-direction:column;height:100%}header{padding:24px 32px 16px;border-bottom:1px solid #2a2140}h1{font-size:20px;margin:0 0 6px}.meta{color:#aaa3b9;font-size:12px;margin:0}main{flex:1;overflow-y:auto;padding:20px 32px}h2{font-size:13px;margin:18px 0 6px;color:#c4b5fd}p{margin:0;color:#cbc6d8;font-size:13px;line-height:1.65}footer{display:flex;gap:12px;justify-content:flex-end;padding:16px 32px;border-top:1px solid #2a2140;background:#0b0a12}button{font:inherit;font-size:13px;padding:10px 18px;border-radius:10px;border:1px solid #3a3155;background:transparent;color:#cbc6d8;cursor:pointer}button.primary{background:linear-gradient(135deg,#7c3aed,#a855f7);border-color:transparent;color:#fff;font-weight:600}</style></head><body><header><h1>${PRODUCT_NAME} — Terms and Conditions</h1><p class="meta">Published by ${PUBLISHER_NAME} · Version ${TERMS_VERSION}</p></header><main>${sections}</main><footer><button id="decline">Decline and exit</button><button id="accept" class="primary">I accept these Terms</button></footer><script>document.getElementById('accept').addEventListener('click',function(){window.geneiDesktop.acceptTerms();});document.getElementById('decline').addEventListener('click',function(){window.geneiDesktop.declineTerms();});</script></body></html>`;
}

function showTermsGate() {
  return new Promise((resolve) => {
    const termsWindow = new BrowserWindow({
      width: 940,
      height: 780,
      minWidth: 720,
      minHeight: 560,
      title: `${PRODUCT_NAME} — Terms and Conditions`,
      backgroundColor: "#07070b",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;
    const settle = (accepted) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:terms-accept", onAccept);
      ipcMain.removeListener("desktop:terms-decline", onDecline);
      if (accepted) recordTermsAcceptance();
      if (!termsWindow.isDestroyed()) termsWindow.destroy();
      resolve(accepted);
    };
    const onAccept = () => settle(true);
    const onDecline = () => settle(false);

    ipcMain.on("desktop:terms-accept", onAccept);
    ipcMain.on("desktop:terms-decline", onDecline);
    termsWindow.once("ready-to-show", () => termsWindow.show());
    termsWindow.on("closed", () => settle(false));
    void termsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(termsPage())}`);
  });
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
  // Nothing may hold the window open. A renderer that tries to block unload would
  // otherwise leave the user with an app they cannot close.
  mainWindow.webContents.on("will-prevent-unload", (event) => event.preventDefault());
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
      if (!settled) {
        finish(new Error(message));
      } else if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
        // Deliberately NOT dialog.showErrorBox: it is synchronous and modal, so it
        // blocks the Electron main thread - and on a machine where the native
        // dialog cannot render, the window becomes impossible to close. Surface it
        // in the window instead, which stays responsive and closable.
        void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(message))}`);
      }
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
  ipcMain.handle("desktop:terms-status", () => ({ version: TERMS_VERSION, accepted: hasAcceptedTerms(), publisher: PUBLISHER_NAME }));

  // Real system memory, so the server-side queue can pause admission when this
  // machine is running out. Electron reports it in kilobytes.
  ipcMain.handle("desktop:system-memory", () => {
    try {
      const info = process.getSystemMemoryInfo();
      if (!info) return null;
      return {
        totalMB: Math.round((info.total ?? 0) / 1024),
        freeMB: Math.round((info.free ?? 0) / 1024),
        swapTotalMB: Math.round((info.swapTotal ?? 0) / 1024),
        swapFreeMB: Math.round((info.swapFree ?? 0) / 1024),
      };
    } catch {
      return null;
    }
  });

  // Terms must be accepted before any workspace starts.
  if (!hasAcceptedTerms()) {
    const accepted = await showTermsGate();
    if (!accepted) {
      app.quit();
      return;
    }
  }

  createWindow();

  // Backstop: if the workspace has not come up by the hard deadline, surface the
  // failure in the window. The loading screen can never persist indefinitely.
  const hardDeadline = setTimeout(() => {
    if (serverPort) return;
    void showStartupError(new Error("Startup did not complete within 45 seconds on this computer. The embedded workspace may have failed to launch."));
  }, STARTUP_HARD_DEADLINE_MS);

  try {
    const port = await startLocalServer();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    }
    // Hardware detection must never delay the first usable workspace.
    hardwareProfile = await probeHardware();
  } catch (error) {
    await showStartupError(error);
  } finally {
    clearTimeout(hardDeadline);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

bootstrap().catch(async (error) => {
  writeDiagnostic(`Unhandled bootstrap error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  const message = error instanceof Error ? error.message : "The desktop application could not start.";
  try {
    // Asynchronous only. A modal box here would block the main thread at exactly
    // the moment the user is trying to close the application.
    if (app.isReady()) {
      await dialog.showMessageBox({ type: "error", title: PRODUCT_NAME, message, buttons: ["Close"] });
    }
  } catch {
    // Reporting a failure must never itself hang the application.
  }
  flushDiagnostics();
  app.quit();
});

// child.kill() does not reliably terminate a whole process tree on Windows, and
// any surviving grandchild keeps the app alive - which is what makes the window
// appear impossible to close.
function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // A process that has already gone is not an error.
  }
}

app.on("window-all-closed", () => {
  stopChild(serverProcess);
  stopChild(hardwareProbeProcess);
  flushDiagnostics();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopChild(serverProcess);
  stopChild(hardwareProbeProcess);
  flushDiagnostics();
});
