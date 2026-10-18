import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { resolveInstallPlan, resolveAllInstallPlans, scoreAsset, selectAsset, type Platform } from "./toolReleases";
import { resolveWeightCatalogue, resolveUserSuppliedRepo, listHuggingFaceTree, formatWeightSize, WEIGHT_CATALOGUE } from "./modelWeights";
import { AssetInstaller, formatBytes } from "./assetDownloader";
import { getTool } from "./modelRegistry";
import { configureProxyFromEnvironment } from "./_core/network";

/**
 * These two cases read real data from GitHub and Hugging Face. They are the evidence
 * that the resolvers return facts rather than fiction, so they are kept — but they are
 * skipped where the environment has no direct egress (this sandbox routes outbound
 * traffic through a proxy that Node's fetch does not use), rather than failing.
 */
// Configure outbound networking exactly as the server does. Node's fetch ignores
// HTTP_PROXY on its own, so without this the probe below reports "no network" on a host
// that has perfectly good egress through a proxy.
const proxyOutcome = configureProxyFromEnvironment();

/**
 * Reachability, not quota. A response of any status — including 403 or 429 — proves that
 * outbound traffic works; only a thrown error means there is no network. Testing
 * `response.ok` instead would skip these tests whenever GitHub's unauthenticated hourly
 * allowance happened to be spent, which is a quota condition, not a network one.
 */
const liveNetworkAvailable = await (async () => {
  try {
    await fetch("https://api.github.com/rate_limit", { signal: AbortSignal.timeout(8000) });
    return true;
  } catch {
    return false;
  }
})();

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "genei-plan-"));
const WIN: Platform = { os: "win32", arch: "x64" };
const LINUX: Platform = { os: "linux", arch: "x64" };
const MAC_ARM: Platform = { os: "darwin", arch: "arm64" };

// ── Asset selection (pure) ──────────────────────────────────────────────────

describe("release asset selection", () => {
  it("picks a Windows archive over an installer", () => {
    const assets = [
      { name: "tool-windows-amd64-installer.exe", size: 100, browser_download_url: "a" },
      { name: "tool-windows-amd64.zip", size: 200, browser_download_url: "b" },
      { name: "tool-linux-x86_64.tar.gz", size: 150, browser_download_url: "c" },
    ];
    expect(selectAsset(assets, WIN)?.name).toBe("tool-windows-amd64.zip");
  });

  it("picks a Linux AppImage and refuses an arm64 build on x64", () => {
    const assets = [
      { name: "tool-linux-arm64.tar.gz", size: 100, browser_download_url: "a" },
      { name: "tool-x86_64.AppImage", size: 200, browser_download_url: "b" },
    ];
    expect(selectAsset(assets, LINUX)?.name).toBe("tool-x86_64.AppImage");
  });

  it("picks an Apple Silicon build for arm64 macOS", () => {
    const assets = [
      { name: "tool-macos-x64.dmg", size: 100, browser_download_url: "a" },
      { name: "tool-macos-arm64.dmg", size: 200, browser_download_url: "b" },
    ];
    expect(selectAsset(assets, MAC_ARM)?.name).toBe("tool-macos-arm64.dmg");
  });

  it("returns nothing when no asset matches the platform", () => {
    const assets = [{ name: "tool-linux-x86_64.tar.gz", size: 100, browser_download_url: "a" }];
    expect(selectAsset(assets, WIN)).toBeNull();
    expect(scoreAsset("tool-linux-x86_64.tar.gz", WIN)).toBe(0);
  });

  it("reproduces the real ComfyUI Windows asset choice", () => {
    // Names taken from the live Comfy-Org/ComfyUI release.
    const assets = [
      { name: "ComfyUI_windows_portable_nvidia.7z", size: 2_010_075_321, browser_download_url: "n" },
      { name: "ComfyUI_windows_portable_amd.7z", size: 1_627_801_471, browser_download_url: "a" },
      { name: "ComfyUI_windows_portable_intel.7z", size: 1_442_748_194, browser_download_url: "i" },
    ];
    const chosen = selectAsset(assets, WIN);
    expect(chosen).not.toBeNull();
    expect(chosen?.name).toMatch(/ComfyUI_windows_portable/);
  });
});

// ── Plan resolution ─────────────────────────────────────────────────────────

describe("install plan resolution", () => {
  it("builds an archive step from a real-looking release response", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          tag_name: "v9.9.9",
          assets: [{ name: "video2x-windows-amd64.zip", size: 196_989_277, browser_download_url: "https://example.test/v.zip", digest: "sha256:abc123" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const plan = await resolveInstallPlan(getTool("video2x")!, WIN, { fetchImpl });
    expect(plan.origin).toBe("github-release");
    expect(plan.releaseTag).toBe("v9.9.9");
    const step = plan.steps[0];
    expect(step.kind).toBe("archive");
    if (step.kind === "archive") {
      expect(step.url).toBe("https://example.test/v.zip");
      expect(step.sizeBytes).toBe(196_989_277);
      expect(step.extract).toBe("zip");
      expect(step.sha256).toBe("abc123");
    }
  });

  it("falls back honestly when the release carries no matching asset", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ tag_name: "v1", assets: [] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const plan = await resolveInstallPlan(getTool("video2x")!, WIN, { fetchImpl });
    expect(plan.origin).toBe("static-fallback");
    expect(plan.notes.join(" ")).toMatch(/no release binaries/i);
    expect(plan.steps[0].kind).toBe("git");
  });

  it("offers the documented package-manager command for FFmpeg", async () => {
    const plan = await resolveInstallPlan(getTool("ffmpeg")!, LINUX, { offline: true });
    const step = plan.steps[0];
    expect(step.kind).toBe("package-manager");
    if (step.kind === "package-manager") {
      expect(step.manager).toBe("apt");
      expect(step.command).toContain("apt-get install");
      expect(step.requiresElevation).toBe(true);
    }
  });

  it("never claims it can install a model that has to be served", async () => {
    const plan = await resolveInstallPlan(getTool("qwen3-vl")!, WIN, { offline: true });
    expect(plan.steps[0].kind).toBe("manual");
    if (plan.steps[0].kind === "manual") expect(plan.steps[0].reason).toMatch(/not an installer/i);
  });

  it("says so when it is offline instead of guessing a URL", async () => {
    const plan = await resolveInstallPlan(getTool("video2x")!, WIN, { offline: true });
    expect(plan.notes.join(" ")).toMatch(/offline/i);
  });

  it("resolves a plan for every registered tool", async () => {
    const plans = await resolveAllInstallPlans(WIN, { offline: true });
    expect(plans.length).toBeGreaterThan(5);
    for (const plan of plans) {
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.toolId.length).toBeGreaterThan(0);
    }
  });

  it("reports how outbound networking was configured", () => {
    // If these tests skip, this line says exactly why.
    console.log(`[network] proxy configured: ${proxyOutcome.configured}${proxyOutcome.proxy ? ` via ${proxyOutcome.proxy}` : ""}${proxyOutcome.reason ? ` (${proxyOutcome.reason})` : ""}`);
    expect(typeof proxyOutcome.configured).toBe("boolean");
  });

  it.skipIf(!liveNetworkAvailable)("reads the LIVE release data for Video2X and ComfyUI", async () => {
    // A real network call, so this is evidence the resolver is not returning fiction.
    // It must be honest in both outcomes: either the live release is read, or the lookup
    // failed (a rate limit, an outage) and the fallback says why. What it must never do
    // is present a fallback as if it were the live release.
    const plans = await Promise.all([resolveInstallPlan(getTool("video2x")!, WIN), resolveInstallPlan(getTool("comfyui")!, WIN)]);

    for (const plan of plans) {
      expect(["github-release", "static-fallback"], plan.toolId).toContain(plan.origin);
      expect(plan.steps.length, `${plan.toolId} produced no install step at all`).toBeGreaterThan(0);

      const step = plan.steps[0];
      if (plan.origin === "github-release") {
        expect(plan.releaseTag, plan.toolId).toBeTruthy();
        expect(step.url, plan.toolId).toMatch(/^https:\/\//);
      } else {
        // A fallback must carry the reason, and must not claim a release tag it did not read.
        expect(plan.releaseTag, `${plan.toolId} fell back but still reported a release tag`).toBeFalsy();
        expect(plan.notes.join(" "), `${plan.toolId} fell back without saying why`).toMatch(/rate limit|HTTP|network|could not|unavailable|failed/i);
      }
    }
  });

  it("reports an offline state instead of an empty catalogue", async () => {
    const { files, error } = await resolveWeightCatalogue(WEIGHT_CATALOGUE[0], { offline: true });
    expect(files).toHaveLength(0);
    expect(error).toMatch(/offline/i);
  });

  it("rejects a malformed user-supplied repository id", async () => {
    const { error } = await resolveUserSuppliedRepo("not a repo", "wan22", { offline: true });
    expect(error).toMatch(/owner\/name/);
  });

  it("resolves a user-supplied repository through the same path", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify([{ type: "file", path: "wan2.2-ti2v-5b.safetensors", size: 9_000_000_000 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const { files } = await resolveUserSuppliedRepo("https://huggingface.co/Someone/Wan2.2", "wan22", { fetchImpl });
    expect(files).toHaveLength(1);
    expect(files[0].repo).toBe("Someone/Wan2.2");
    expect(files[0].url).toContain("huggingface.co/Someone/Wan2.2/resolve/main/");
  });

  it.skipIf(!liveNetworkAvailable)("reads the LIVE Hub listing for whisper.cpp", async () => {
    const { files, error } = await resolveWeightCatalogue(WEIGHT_CATALOGUE[0]);
    expect(error).toBeUndefined();
    expect(files.length).toBeGreaterThan(3);
    expect(files.some((file) => file.path === "ggml-large-v3-turbo-q5_0.bin")).toBe(true);
    // Sizes come from the Hub, so they must be real magnitudes, not placeholders.
    expect(files.every((file) => file.sizeBytes > 1_000_000)).toBe(true);
  }, 40_000);

  it("formats sizes readably", () => {
    expect(formatWeightSize(0)).toBe("size unknown");
    expect(formatWeightSize(574_041_195)).toBe("547.4 MB");
  });
});

// ── Plan-driven install ─────────────────────────────────────────────────────

describe("plan-driven install", () => {
  let server: http.Server;
  let base = "";
  let mode: "ok" | "short" | "badhash" = "ok";
  const payload = Buffer.alloc(4096, 7);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const body = mode === "short" ? payload.subarray(0, 1024) : payload;
      res.setHeader("content-length", String(body.byteLength));
      res.setHeader("content-type", "application/zip");
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("downloads, verifies the published size, and only then reports ready", async () => {
    mode = "ok";
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan(
      {
        toolId: "video2x",
        platform: WIN,
        origin: "github-release",
        releaseTag: "v1",
        steps: [{ kind: "archive", url: `${base}/tool.zip`, fileName: "tool.zip", sizeBytes: payload.byteLength, extract: "none", note: "test" }],
        notes: [],
        requiresWeights: false,
      },
      { extract: false },
    );
    expect(record.status).toBe("ready");
    expect(record.installPath).toBeTruthy();
    expect(fs.existsSync(record.installPath!)).toBe(true);
  });

  it("discards a download whose size does not match the release", async () => {
    mode = "short";
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan({
      toolId: "video2x",
      platform: WIN,
      origin: "github-release",
      steps: [{ kind: "archive", url: `${base}/tool.zip`, fileName: "tool.zip", sizeBytes: payload.byteLength, extract: "none", note: "test" }],
      notes: [],
      requiresWeights: false,
    });
    expect(record.status).toBe("failed");
    expect(record.message).toMatch(/publishes/i);
    expect(record.installPath).toBeNull();
  });

  it("discards a download whose checksum does not match", async () => {
    mode = "ok";
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan({
      toolId: "video2x",
      platform: WIN,
      origin: "github-release",
      steps: [{ kind: "archive", url: `${base}/tool.zip`, fileName: "tool.zip", sizeBytes: payload.byteLength, extract: "none", note: "test", sha256: "0".repeat(64) }],
      notes: [],
      requiresWeights: false,
    });
    expect(record.status).toBe("failed");
    expect(record.message).toMatch(/checksum mismatch/i);
  });

  it("accepts a download whose checksum matches", async () => {
    mode = "ok";
    const crypto = await import("node:crypto");
    const digest = crypto.createHash("sha256").update(payload).digest("hex");
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan(
      {
        toolId: "video2x",
        platform: WIN,
        origin: "github-release",
        steps: [{ kind: "archive", url: `${base}/tool.zip`, fileName: "tool.zip", sizeBytes: payload.byteLength, extract: "none", note: "test", sha256: digest }],
        notes: [],
        requiresWeights: false,
      },
      { extract: false },
    );
    expect(record.status).toBe("ready");
  });

  it("never runs an elevated command without explicit consent", async () => {
    const installer = new AssetInstaller(tmp());
    const plan = {
      toolId: "ffmpeg",
      platform: LINUX,
      origin: "static-fallback" as const,
      steps: [{ kind: "package-manager" as const, manager: "apt" as const, command: "sudo apt-get install -y ffmpeg", requiresElevation: true, note: "needs rights" }],
      notes: [],
      requiresWeights: false,
    };
    const refused = await installer.installFromPlan(plan);
    expect(refused.status).toBe("needs_source");
    expect(refused.message).toContain("sudo apt-get install");

    // With consent it runs — using a harmless command so the test is safe.
    const benign = await installer.installFromPlan({
      ...plan,
      steps: [{ kind: "package-manager", manager: "apt", command: "echo consented", requiresElevation: true, note: "test" }],
    }, { allowElevatedCommands: true });
    expect(benign.status).toBe("ready");
  });

  it("reports a manual-only tool honestly", async () => {
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan({
      toolId: "qwen3-vl",
      platform: WIN,
      origin: "none",
      steps: [{ kind: "manual", reason: "Serve it yourself.", docsUrl: "https://example.test" }],
      notes: [],
      requiresWeights: true,
    });
    expect(record.status).toBe("needs_source");
    expect(record.message).toMatch(/Serve it yourself/);
  });

  it("still refuses an unknown tool", async () => {
    const installer = new AssetInstaller(tmp());
    const record = await installer.installFromPlan({ toolId: "nope", platform: WIN, origin: "none", steps: [], notes: [], requiresWeights: false });
    expect(record.status).toBe("failed");
  });

  it("formats bytes readably", () => {
    expect(formatBytes(196_989_277)).toBe("187.9 MB");
  });
});
