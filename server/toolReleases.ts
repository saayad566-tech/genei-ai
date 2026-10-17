/**
 * Install-plan resolver.
 *
 * Turns a tool in the registry into a concrete, real install plan for the machine it
 * is running on. Where a project publishes per-platform release binaries, those are
 * read from the GitHub releases API at resolve time — the URL and size come from the
 * release itself, not from a hardcoded guess that rots.
 *
 * Where a project publishes no binaries, the plan says so honestly and offers the real
 * alternative (build from source, or install through the platform package manager).
 * A tool that cannot be installed automatically is reported as such, never faked.
 */

import { getTool, type ToolEntry } from "./modelRegistry";

export type Platform = { os: "win32" | "darwin" | "linux"; arch: "x64" | "arm64" };

export type InstallStep =
  | { kind: "archive"; url: string; fileName: string; sizeBytes: number; extract: "zip" | "7z" | "tar.gz" | "appimage" | "none"; note: string; sha256?: string }
  | { kind: "git"; url: string; note: string }
  | { kind: "package-manager"; manager: "winget" | "brew" | "apt"; command: string; requiresElevation: boolean; note: string }
  | { kind: "manual"; reason: string; docsUrl: string };

export type InstallPlan = {
  toolId: string;
  platform: Platform;
  /** Where the plan came from. */
  origin: "github-release" | "static-fallback" | "none";
  releaseTag?: string;
  steps: InstallStep[];
  notes: string[];
  /** Model weights this tool needs, resolved separately by the weight resolver. */
  requiresWeights: boolean;
};

export function currentPlatform(): Platform {
  const os = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { os, arch };
}

type GithubAsset = { name: string; size: number; browser_download_url: string; digest?: string | null };

function extractKindFor(name: string): Extract<InstallStep, { kind: "archive" }>["extract"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".7z")) return "7z";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".appimage")) return "appimage";
  return "none";
}

/** Score an asset against the target platform. Higher is a better match; 0 means no. */
export function scoreAsset(name: string, platform: Platform): number {
  const lower = name.toLowerCase();
  let score = 0;

  if (platform.os === "win32") {
    if (!/(windows|win32|win64|\bwin\b|-win)/.test(lower)) return 0;
    if (/arm64|aarch64/.test(lower) && platform.arch !== "arm64") return 0;
    score += 10;
    if (platform.arch === "x64" && /(amd64|x86_64|x64)/.test(lower)) score += 6;
    if (platform.arch === "arm64" && /arm64/.test(lower)) score += 6;
    // Prefer a plain archive over an installer: it needs no elevation.
    if (lower.endsWith(".zip") || lower.endsWith(".7z")) score += 4;
    if (/installer|setup/.test(lower)) score -= 3;
    return score;
  }

  if (platform.os === "linux") {
    const isLinux = /(linux|appimage)/.test(lower);
    if (!isLinux) return 0;
    if (/arm64|aarch64/.test(lower) && platform.arch !== "arm64") return 0;
    score += 10;
    if (platform.arch === "x64" && /(x86_64|amd64|x64)/.test(lower)) score += 6;
    if (lower.endsWith(".appimage")) score += 3;
    if (lower.endsWith(".tar.gz")) score += 2;
    if (/debian|\.deb|rpm/.test(lower)) score -= 2;
    return score;
  }

  // darwin
  if (!/(macos|darwin|osx|universal)/.test(lower)) return 0;
  score += 10;
  if (platform.arch === "arm64" && /(arm64|aarch64|universal)/.test(lower)) score += 6;
  if (platform.arch === "x64" && /(x64|x86_64|intel|universal)/.test(lower)) score += 6;
  if (lower.endsWith(".dmg")) score += 2;
  return score;
}

/** Pick the best-matching asset for a platform, or null when none fits. */
export function selectAsset(assets: GithubAsset[], platform: Platform): GithubAsset | null {
  const scored = assets
    .map((asset) => ({ asset, score: scoreAsset(asset.name, platform) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.size - b.asset.size);
  return scored.length > 0 ? scored[0].asset : null;
}

/** Real, documented package-manager invocations. */
const PACKAGE_MANAGER_RECIPES: Record<string, Record<Platform["os"], { manager: "winget" | "brew" | "apt"; command: string; requiresElevation: boolean } | null>> = {
  ffmpeg: {
    win32: { manager: "winget", command: "winget install --id Gyan.FFmpeg -e", requiresElevation: false },
    darwin: { manager: "brew", command: "brew install ffmpeg", requiresElevation: false },
    linux: { manager: "apt", command: "sudo apt-get install -y ffmpeg", requiresElevation: true },
  },
};

/** Tools whose upstream publishes no binaries; the honest alternative is recorded here. */
const STATIC_FALLBACKS: Record<string, (platform: Platform) => InstallStep[]> = {
  "whisper-cpp": () => [
    { kind: "git", url: "https://github.com/ggml-org/whisper.cpp.git", note: "whisper.cpp publishes source rather than prebuilt binaries; the repository is built locally after cloning." },
  ],
  "llama-cpp": () => [
    { kind: "git", url: "https://github.com/ggml-org/llama.cpp.git", note: "llama.cpp ships source; its release tags carry no binaries for this platform." },
  ],
  "real-esrgan": () => [
    { kind: "git", url: "https://github.com/xinntao/Real-ESRGAN.git", note: "Real-ESRGAN publishes no release binaries; the repository is cloned and its weights are fetched separately." },
  ],
  musetalk: () => [
    { kind: "manual", reason: "The MuseTalk repository could not be reached from here, so no automatic install is offered. Install it manually and it will be detected.", docsUrl: "https://github.com/TMElyralab/MuseTalk" },
  ],
  "qwen3-vl": () => [
    { kind: "manual", reason: "Qwen3-VL is a model, not an installer: serve it with llama.cpp or another runtime and point GENEI_VLM_URL at it.", docsUrl: "https://github.com/QwenLM/Qwen3-VL" },
  ],
  wan22: () => [
    { kind: "manual", reason: "Wan2.2 weights are hosted per variant. Supply a weights source and it will be downloaded and verified.", docsUrl: "https://github.com/Wan-Video/Wan2.2" },
  ],
  wav2lip: () => [
    { kind: "git", url: "https://github.com/Rudrabha/Wav2Lip.git", note: "Wav2Lip publishes source and separate checkpoints." },
  ],
  video2x: () => [
    { kind: "git", url: "https://github.com/k4yt3x/video2x.git", note: "No matching release binary was found; the source repository is cloned instead." },
  ],
};

function repoFromUrl(url: string): string | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/);
  return match ? `${match[1]}/${match[2].replace(/\.git$/, "")}` : null;
}

export type ResolveOptions = {
  fetchImpl?: typeof fetch;
  /** Skip the network (used by hermetic tests). */
  offline?: boolean;
  token?: string;
};

/**
 * Resolve the real install plan for a tool on a platform.
 * Network failures degrade to the static fallback and are reported in `notes`.
 */
export async function resolveInstallPlan(tool: ToolEntry, platform: Platform = currentPlatform(), options: ResolveOptions = {}): Promise<InstallPlan> {
  const notes: string[] = [];
  const repo = repoFromUrl(tool.repositoryUrl);
  const staticSteps = STATIC_FALLBACKS[tool.id]?.(platform) ?? [];
  const packageRecipe = PACKAGE_MANAGER_RECIPES[tool.id]?.[platform.os];

  // A package manager is the right route for a system tool.
  if (packageRecipe) {
    return {
      toolId: tool.id,
      platform,
      origin: "static-fallback",
      steps: [
        {
          kind: "package-manager",
          manager: packageRecipe.manager,
          command: packageRecipe.command,
          requiresElevation: packageRecipe.requiresElevation,
          note: packageRecipe.requiresElevation
            ? "This command needs administrator rights and is never run for you automatically."
            : "This command runs as your user and is never run for you automatically.",
        },
      ],
      notes,
      requiresWeights: false,
    };
  }

  if (repo && !options.offline) {
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
      const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "GeneiAI" };
      if (options.token) headers.authorization = `Bearer ${options.token}`;
      const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(12_000) });
      if (response.ok) {
        const release = (await response.json()) as { tag_name?: string; assets?: GithubAsset[] };
        const assets = (release.assets ?? []).filter((asset) => typeof asset?.browser_download_url === "string" && typeof asset?.name === "string");
        const chosen = selectAsset(assets, platform);
        if (chosen) {
          return {
            toolId: tool.id,
            platform,
            origin: "github-release",
            releaseTag: release.tag_name,
            steps: [
              {
                kind: "archive",
                url: chosen.browser_download_url,
                fileName: chosen.name,
                sizeBytes: chosen.size,
                extract: extractKindFor(chosen.name),
                sha256: typeof chosen.digest === "string" && chosen.digest.startsWith("sha256:") ? chosen.digest.slice(7) : undefined,
                note: `Official release asset from ${repo} ${release.tag_name ?? ""}`.trim(),
              },
            ],
            notes,
            requiresWeights: tool.requiresWeightSource,
          };
        }
        notes.push(
          assets.length === 0
            ? `${repo} publishes no release binaries, so no prebuilt download is offered.`
            : `None of the ${assets.length} release assets for ${repo} match ${platform.os}/${platform.arch}.`,
        );
      } else if (response.status === 404) {
        notes.push(`${repo} could not be found on GitHub.`);
      } else {
        notes.push(`The GitHub releases API answered HTTP ${response.status} for ${repo}.`);
      }
    } catch (error) {
      notes.push(`Could not reach the GitHub releases API for ${repo}: ${error instanceof Error ? error.message : "unknown error"}.`);
    }
  } else if (options.offline) {
    notes.push("Offline: the release list was not consulted.");
  }

  if (staticSteps.length > 0) {
    return { toolId: tool.id, platform, origin: "static-fallback", steps: staticSteps, notes, requiresWeights: tool.requiresWeightSource };
  }

  // Last resort: the tool's own declared install method.
  if (tool.installKind === "git" && tool.sourceUrl) {
    return {
      toolId: tool.id,
      platform,
      origin: "static-fallback",
      steps: [{ kind: "git", url: tool.sourceUrl, note: "Cloned from the official repository." }],
      notes,
      requiresWeights: tool.requiresWeightSource,
    };
  }

  return {
    toolId: tool.id,
    platform,
    origin: "none",
    steps: [{ kind: "manual", reason: `No automatic install is available for ${tool.name} on ${platform.os}/${platform.arch}.`, docsUrl: tool.docsUrl ?? tool.repositoryUrl }],
    notes,
    requiresWeights: tool.requiresWeightSource,
  };
}

/** Resolve plans for every tool in the registry. */
export async function resolveAllInstallPlans(platform: Platform = currentPlatform(), options: ResolveOptions = {}): Promise<InstallPlan[]> {
  const { TOOL_REGISTRY } = await import("./modelRegistry");
  return Promise.all(TOOL_REGISTRY.map((tool) => resolveInstallPlan(tool, platform, options)));
}

export function getToolForPlan(toolId: string): ToolEntry | undefined {
  return getTool(toolId);
}
