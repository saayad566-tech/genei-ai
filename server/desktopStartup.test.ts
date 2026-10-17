import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Genei AI desktop startup recovery contract", () => {
  it("does not depend on one exact stdout chunk or an unbounded wait", () => {
    const host = read("desktop/main.cjs");

    expect(host).toContain("outputBuffer += text");
    expect(host).toContain("outputBuffer.split(/\\r?\\n/)");
    expect(host).toContain("STARTUP_TIMEOUT_MS");
    expect(host).toContain("The embedded workspace did not become ready within 30 seconds.");
    expect(host).toContain("checkLocalServer(port)");
    expect(host).toContain("desktopWorkingDirectory()");
    expect(host).toContain("app.asar.unpacked");
    expect(host).toContain("validatePackagedLayout()");
    expect(host).toContain("app.getPath(\"userData\")");
  });

  it("keeps recovery inside the same Genei product", () => {
    const host = read("desktop/main.cjs");
    const packageJson = JSON.parse(read("package.json")) as {
      build: { productName: string; executableName: string; asarUnpack: string[]; files: string[]; nsis: { runAfterFinish: boolean }; portable: { artifactName: string } };
    };

    expect(packageJson.build.productName).toBe("Genei AI Desktop");
    expect(packageJson.build.executableName).toBe("GeneiAI");
    // Only the spawned server bundle needs a real path on disk. Unpacking
    // node_modules wrote tens of thousands of loose files for Windows to create
    // and scan, which is what made installation and first launch slow, so it
    // must stay packed inside app.asar. `runtime` is already copied outside the
    // archive by extraResources and never needed an asarUnpack entry.
    expect(packageJson.build.asarUnpack).toEqual(["dist/**/*"]);
    // The client dependency tree is bundled by Vite into dist/public and must not
    // be shipped a second time.
    expect(packageJson.build.files).toEqual(expect.arrayContaining(["!node_modules/react/**", "!node_modules/@radix-ui/**"]));
    expect(packageJson.build.nsis.runAfterFinish).toBe(false);
    expect(packageJson.build.portable.artifactName).toContain("Genei-AI-Desktop-Portable");
    expect(host).toContain("use the portable Genei AI Desktop download");
    expect(host).not.toContain("GeneiRunner.exe");
  });

  it("keeps development-only Vite loading lazy for packaged startup", () => {
    const viteBridge = read("server/_core/vite.ts");

    expect(viteBridge).toContain('import express, { type Express } from "express";');
    expect(viteBridge).toContain('import("vite")');
    expect(viteBridge).toContain('import("../../vite.config")');
    expect(viteBridge).not.toMatch(/from ["']vite["']/);
    expect(viteBridge).not.toMatch(/import \{\s*type Express\s*\} from "express"/);
  });

  it("logs the real bound port when desktop mode requests an ephemeral port", () => {
    const server = read("server/_core/index.ts");

    expect(server).toContain("const address = server.address()");
    expect(server).toContain("const actualPort = typeof address === \"object\" && address ? address.port : port");
    expect(server).toContain("Server running on http://localhost:${actualPort}/");
  });

  it("requires the native Windows workflow to smoke-test the installed workspace before publishing", () => {
    const workflow = read(".github/workflows/build-genei-runner-windows.yml");
    const smokeScript = read("packaging/smoke_windows_desktop.ps1");

    expect(workflow).toContain("Smoke test the installed embedded workspace");
    expect(workflow).toContain("smoke_windows_desktop.ps1");
    expect(smokeScript).toContain("ELECTRON_RUN_AS_NODE");
    expect(smokeScript).toContain("Server running on http://localhost:");
    expect(smokeScript).toContain("Embedded server exited before readiness");
    expect(smokeScript).toContain("Invoke-WebRequest");
  });

  it("tracks and cleans up the server and hardware children", () => {
    const host = read("desktop/main.cjs");

    expect(host).toContain("let serverProcess;");
    expect(host).toContain("let hardwareProbeProcess;");
    expect(host).toContain("stopChild(serverProcess)");
    expect(host).toContain("stopChild(hardwareProbeProcess)");
  });

  it("requires Terms and Conditions acceptance and ships them with the installer", () => {
    const host = read("desktop/main.cjs");
    const packageJson = JSON.parse(read("package.json")) as {
      author: string;
      build: { win: { legalTrademarks: string; signtoolOptions: { publisherName: string } }; nsis: { license: string; uninstallDisplayName: string } };
    };

    // First-run acceptance gate.
    expect(host).toContain("TERMS_VERSION");
    expect(host).toContain("hasAcceptedTerms()");
    expect(host).toContain("showTermsGate()");
    expect(host).toContain("terms-acceptance.json");

    // Publisher identity and the installer licence page.
    expect(packageJson.author).toBe("SaayadTech");
    // electron-builder 26 keeps publisherName under win.signtoolOptions; an unknown
    // key in `win` makes the whole build fail schema validation.
    expect(packageJson.build.win.signtoolOptions.publisherName).toBe("SaayadTech");
    expect(packageJson.build.win.legalTrademarks).toBe("SaayadTech");
    expect(packageJson.build.nsis.license).toBe("packaging/EULA.txt");
    expect(packageJson.build.nsis.uninstallDisplayName).toContain("SaayadTech");
    expect(fs.existsSync(path.join(root, "packaging/EULA.txt"))).toBe(true);
  });
});
