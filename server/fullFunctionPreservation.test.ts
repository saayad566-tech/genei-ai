import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const requiredRoutes = [
  'path="/music"',
  'path="/video"',
  'path="/director"',
  'path="/image"',
  'path="/app-builder"',
  'path="/website"',
  'path="/voice"',
  'path="/automation"',
  'path="/marketplace"',
  'path="/assets"',
  'path="/api"',
  'path="/byoh"',
  'path="/comfy"',
  'path="/team"',
  'path="/monetization"',
  'path="/export"',
  'path="/settings"',
];

const requiredPages = [
  "client/src/pages/MusicStudio.tsx",
  "client/src/pages/VideoStudio.tsx",
  "client/src/pages/DirectorConsole.tsx",
  "client/src/pages/ImageGenerator.tsx",
  "client/src/pages/AppBuilder.tsx",
  "client/src/pages/WebsiteBuilder.tsx",
  "client/src/pages/VoiceLab.tsx",
  "client/src/pages/AutomationCenter.tsx",
  "client/src/pages/Marketplace.tsx",
  "client/src/pages/AssetLibrary.tsx",
  "client/src/pages/ApiIntegrations.tsx",
  "client/src/pages/ByohDashboard.tsx",
  "client/src/pages/ComfyWorkflowStudio.tsx",
  "client/src/pages/TeamWorkspace.tsx",
  "client/src/pages/Monetization.tsx",
  "client/src/pages/ExportCenter.tsx",
  "client/src/pages/Settings.tsx",
];

describe("full Genei AI function preservation", () => {
  it("keeps every creator and platform route in the unified app shell", () => {
    const app = read("client/src/App.tsx");
    const layout = read("client/src/components/GeneiLayout.tsx");

    for (const route of requiredRoutes) expect(app).toContain(route);
    for (const page of requiredPages) expect(fs.existsSync(path.join(root, page))).toBe(true);
    for (const label of ["Music Studio", "Video Studio", "Director Console", "Image Generator", "API Integrations", "Hardware & Runtime", "ComfyUI Graph Studio", "Export Center"]) {
      expect(layout).toContain(label);
    }
  });

  it("packages the complete workspace and embedded runtime rather than a runner", () => {
    const packageJson = JSON.parse(read("package.json")) as { build: { files: string[]; extraResources: Array<{ from: string; to: string }> } };
    const workflow = read(".github/workflows/build-genei-runner-windows.yml");

    expect(packageJson.build.files).toEqual(expect.arrayContaining(["dist/**/*", "desktop/**/*", "package.json"]));
    expect(packageJson.build.extraResources).toEqual(expect.arrayContaining([{ from: "runtime", to: "runtime", filter: ["**/*"] }]));
    expect(workflow).toContain("Genei-AI-Desktop-Setup-*.exe");
    expect(workflow).toContain("Genei-AI-Desktop-Portable-*.exe");
    expect(workflow).toContain("runnerRequired = $false");
    expect(workflow).not.toContain("GeneiRunner.exe");
  });
});
