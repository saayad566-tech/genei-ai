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
      build: { productName: string; executableName: string; asarUnpack: string[]; nsis: { runAfterFinish: boolean }; portable: { artifactName: string } };
    };

    expect(packageJson.build.productName).toBe("Genei AI Desktop");
    expect(packageJson.build.executableName).toBe("GeneiAI");
    expect(packageJson.build.asarUnpack).toEqual(expect.arrayContaining(["dist/**/*", "runtime/**/*"]));
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

  it("tracks and cleans up the server and hardware children", () => {
    const host = read("desktop/main.cjs");

    expect(host).toContain("let serverProcess;");
    expect(host).toContain("let hardwareProbeProcess;");
    expect(host).toContain("stopChild(serverProcess)");
    expect(host).toContain("stopChild(hardwareProbeProcess)");
  });
});
