import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Genei AI Desktop packaging contract", () => {
  it("declares a one-click branded desktop installer", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      main: string;
      build: { productName: string; files: string[]; nsis: { oneClick: boolean; perMachine: boolean } };
      scripts: Record<string, string>;
    };

    expect(packageJson.main).toBe("desktop/main.cjs");
    expect(packageJson.build.productName).toBe("Genei AI Desktop");
    expect(packageJson.build.files).toEqual(expect.arrayContaining(["dist/**/*", "desktop/**/*"]));
    expect(packageJson.build.nsis).toMatchObject({ oneClick: true, perMachine: false });
    expect(packageJson.scripts["desktop:build"]).toContain("electron-builder");
  });

  it("starts the bundled server and probes hardware through the internal host", () => {
    const host = read("desktop/main.cjs");
    expect(host).toContain("app.requestSingleInstanceLock()");
    expect(host).toContain('PORT: "0"');
    expect(host).toContain('spawn(executable, ["--probe"]');
    expect(host).toContain("contextIsolation: true");
    expect(host).toContain("nodeIntegration: false");
    expect(host).not.toContain("pairing token");
  });

  it("builds the complete workspace on a native Windows runner", () => {
    const workflow = read(".github/workflows/build-genei-runner-windows.yml");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("build_windows_desktop.ps1");
    expect(workflow).toContain("electron-builder --win nsis --x64 --publish never");
    expect(workflow).toContain('runnerRequired = $false');
    expect(workflow).not.toContain("GeneiRunner.exe");
  });
});
