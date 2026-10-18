import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Cpu, Download, Loader2, Monitor, Sparkles, XCircle } from "lucide-react";

type DesktopBridge = {
  isDesktop?: boolean;
  refreshHardware?: () => Promise<Record<string, unknown>>;
};

type InstallRow = {
  toolId: string;
  status: string;
  percent: number | null;
  bytesDownloaded: number;
  message: string;
  installPath: string | null;
};

export const ONBOARDING_KEY = "genei.onboarding.completed";

type PlanStep = {
  kind: string;
  url?: string;
  fileName?: string;
  sizeBytes?: number;
  note?: string;
  reason?: string;
  docsUrl?: string;
  manager?: string;
  command?: string;
  requiresElevation?: boolean;
};

type WeightFile = { id: string; toolId: string; role: string; repo: string; path: string; url: string; sizeBytes: number; recommended: boolean; note?: string };
type WeightEntry = { toolId: string; files: WeightFile[]; error?: string };

type InstallPlan = {
  toolId: string;
  origin: "github-release" | "static-fallback" | "none";
  releaseTag?: string;
  notes: string[];
  steps: PlanStep[];
};

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "size unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * What the resolved plan will actually do. Release URLs and sizes come from the
 * upstream release, so this describes a real download rather than a wish.
 */
function planSummary(plan?: InstallPlan): string {
  if (!plan) return "Resolving the install plan…";
  const step = plan.steps[0];
  if (!step) return "No install plan is available for this tool.";
  switch (step.kind) {
    case "archive":
      return `Official release asset · ${formatSize(step.sizeBytes ?? 0)}`;
    case "git":
      return "Built from the official repository";
    case "package-manager":
      return `${step.manager} · ${step.command}`;
    case "manual":
      return step.reason ?? "Manual install required";
    default:
      return step.kind;
  }
}

function statusTone(status: string): { pill: string; label: string } {
  switch (status) {
    case "ready":
      return { pill: "gx-pill gx-pill--ready", label: "Ready" };
    case "installing":
      return { pill: "gx-pill gx-pill--info", label: "Installing" };
    case "needs_source":
      return { pill: "gx-pill gx-pill--pending", label: "Needs source" };
    case "failed":
    case "unsupported":
      return { pill: "gx-pill gx-pill--blocked", label: status === "failed" ? "Failed" : "Unsupported" };
    default:
      return { pill: "gx-pill gx-pill--info", label: "Not installed" };
  }
}

function compatibilityTone(status: string) {
  if (status === "compatible") return { className: "gx-pill gx-pill--ready", label: "Compatible" };
  if (status === "compatible_slow") return { className: "gx-pill gx-pill--pending", label: "Runs on CPU" };
  if (status === "unsupported") return { className: "gx-pill gx-pill--blocked", label: "Unsupported" };
  return { className: "gx-pill gx-pill--info", label: "Unknown" };
}

/**
 * First-launch setup. Everything the platform needs can be fetched from here, so a
 * new user never has to leave the app to find a runtime or a model.
 *
 * Compatibility is reported honestly: on a machine whose hardware cannot be read the
 * screen says "Unknown" rather than promising something it has not verified.
 */
export default function Onboarding() {
  const [, navigate] = useLocation();
  const [hardware, setHardware] = useState<{ os: "win32" | "darwin" | "linux" | "unknown"; ramGB: number | null; vramGB: number | null; backends: Array<"cuda" | "rocm" | "vulkan" | "metal" | "cpu"> }>({
    os: "unknown",
    ramGB: null,
    vramGB: null,
    backends: ["cpu"],
  });
  const [detected, setDetected] = useState(false);
  const [weightNote, setWeightNote] = useState<string | null>(null);
  const [weightRepo, setWeightRepo] = useState("");

  /**
   * Read this machine. Called once on open, and again whenever the user asks — which is
   * what "Use my hardware" means, and matters when the first read failed or the machine
   * changed (an eGPU connected, a driver installed).
   */
  const detectHardware = useCallback(() => {
    setDetected(false);
    const bridge = (window as unknown as { geneiDesktop?: DesktopBridge }).geneiDesktop;
    if (!bridge?.refreshHardware) {
      setDetected(true);
      return;
    }
    void bridge
      .refreshHardware()
      .then((profile) => {
        const ram = Number((profile as { ramGB?: unknown }).ramGB);
        const vram = Number((profile as { vramGB?: unknown }).vramGB);
        const gpu = String((profile as { gpu?: unknown }).gpu ?? "").toLowerCase();
        const backends: Array<"cuda" | "rocm" | "vulkan" | "metal" | "cpu"> = [];
        if (/nvidia|cuda/.test(gpu)) backends.push("cuda");
        if (/amd|radeon|rocm/.test(gpu)) backends.push("rocm");
        if (/apple|metal/.test(gpu)) backends.push("metal");
        backends.push("cpu");
        setHardware({
          os: (["win32", "darwin", "linux"].includes(String((profile as { platform?: unknown }).platform))
            ? String((profile as { platform?: unknown }).platform)
            : "unknown") as "win32" | "darwin" | "linux" | "unknown",
          ramGB: Number.isFinite(ram) && ram > 0 ? ram : null,
          vramGB: Number.isFinite(vram) && vram > 0 ? vram : null,
          backends,
        });
      })
      .catch(() => undefined)
      .finally(() => setDetected(true));
  }, []);

  useEffect(() => {
    detectHardware();
  }, [detectHardware]);

  const registryQuery = trpc.tools.registry.useQuery(
    { os: hardware.os, ramGB: hardware.ramGB ?? undefined, vramGB: hardware.vramGB ?? undefined, backends: hardware.backends },
    { enabled: detected },
  );
  const installsQuery = trpc.tools.installs.useQuery(undefined, {
    // Poll only while something is actually installing.
    refetchInterval: (query) => {
      const data = query.state.data as InstallRow[] | undefined;
      return data?.some((row) => row.status === "installing") ? 1200 : false;
    },
  });

  // The real, resolved install plan for this machine: release URLs and sizes come
  // from the upstream release rather than from a hardcoded link.
  const plansQuery = trpc.tools.plans.useQuery(undefined, { enabled: detected, retry: false });

  // Model weights, resolved live from the Hugging Face Hub — the sizes and links are
  // read from the Hub, not written down here.
  const weightsQuery = trpc.tools.weights.useQuery(undefined, { enabled: detected, retry: false });
  const resolveWeights = trpc.tools.resolveWeights.useMutation({
    onSuccess: (result) => {
      const resolved = result as { files: WeightFile[]; error?: string };
      setWeightNote(
        resolved.error
          ? resolved.error
          : `Resolved ${resolved.files.length} file(s) from that repository.`,
      );
    },
    onError: (error) => setWeightNote(error.message),
  });

  const installMutation = trpc.tools.installFromPlan.useMutation({
    onSuccess: (record) => {
      toast.message(`${record.toolId}`, { description: record.message });
      void installsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelMutation = trpc.tools.cancelInstall.useMutation({ onSuccess: () => void installsQuery.refetch() });

  const installsByTool = useMemo(() => {
    const map = new Map<string, InstallRow>();
    for (const row of (installsQuery.data ?? []) as InstallRow[]) map.set(row.toolId, row);
    return map;
  }, [installsQuery.data]);

  const planByTool = useMemo(() => {
    const map = new Map<string, InstallPlan>();
    for (const plan of (plansQuery.data ?? []) as InstallPlan[]) map.set(plan.toolId, plan);
    return map;
  }, [plansQuery.data]);

  const entries = registryQuery.data ?? [];
  const installable = entries.filter((entry) => entry.compatibility.status === "compatible" || entry.compatibility.status === "compatible_slow");
  const installing = Array.from(installsByTool.values()).some((row) => row.status === "installing");
  const readyCount = Array.from(installsByTool.values()).filter((row) => row.status === "ready").length;

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // A browser that blocks storage simply shows setup again next launch.
    }
    navigate("/video");
  };

  const installAll = async () => {
    for (const entry of installable) {
      if (installsByTool.get(entry.tool.id)?.status === "ready") continue;
      await installMutation.mutateAsync({ toolId: entry.tool.id, extract: true }).catch(() => undefined);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* ── Hero ── */}
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg, var(--genei-cyan), var(--genei-violet))" }}>
            <Sparkles className="h-7 w-7 text-black/80" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome to <span className="genei-gradient-text-cyan">Genei AI</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              One setup, then everything runs here. Genei will install the AI runtimes and tools this computer can actually handle — no external
              stores, no manual Python environments.
            </p>
          </div>
        </div>

        {/* ── Hardware ── */}
        <div className="gx-panel mt-8 p-5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[var(--genei-cyan)]" />
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">This computer</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {[
              { label: "System", value: hardware.os === "unknown" ? "Unknown" : hardware.os },
              { label: "Memory", value: hardware.ramGB ? `${hardware.ramGB} GB` : "Unknown" },
              { label: "Video memory", value: hardware.vramGB ? `${hardware.vramGB} GB` : "Unknown" },
              { label: "Backends", value: hardware.backends.join(", ") },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-mono text-sm text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
          {!detected ? <p className="mt-3 text-xs text-muted-foreground">Reading this computer…</p> : null}
          {detected && hardware.os === "unknown" ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--genei-gold)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Hardware could not be read here, so compatibility is shown as unknown. Nothing is assumed.
            </p>
          ) : null}
        </div>

        {/* ── Install list ── */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Recommended for your machine</h2>
            <p className="text-xs text-muted-foreground">
              {installable.length} of {entries.length} tools fit this computer · {readyCount} already ready
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="gx-seg-btn gx-seg" disabled={detected} onClick={() => detectHardware()}>
              {!detected ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Monitor className="h-3.5 w-3.5" />} Use my hardware
            </button>
            <button type="button" className="gx-seg-btn gx-seg" disabled={installing} onClick={() => void installAll()}>
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Install AI Film Studio
            </button>
            <button type="button" className="gx-cta" onClick={finish}>
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {registryQuery.isLoading ? (
            <div className="gx-panel p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading the tool registry…
            </div>
          ) : null}

          {registryQuery.isError ? (
            <div className="gx-panel p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-[var(--genei-gold)]" />
              The tool registry could not be loaded, so nothing can be listed or installed from here right now. Sign in and reopen this screen to
              try again.
            </div>
          ) : null}

          {!registryQuery.isLoading && !registryQuery.isError && entries.length === 0 ? (
            <div className="gx-panel p-6 text-center text-sm text-muted-foreground">
              No tools are listed for this environment yet. Nothing has been assumed about what this computer can run.
            </div>
          ) : null}

          {entries.map((entry) => {
            const row = installsByTool.get(entry.tool.id);
            const status = row?.status ?? "not_installed";
            const tone = statusTone(status);
            const compat = compatibilityTone(entry.compatibility.status);
            const busy = status === "installing";
            return (
              <div key={entry.tool.id} className="gx-panel gx-panel-hover p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-sm font-semibold text-foreground">{entry.tool.name}</p>
                      <span className={compat.className}>{compat.label}</span>
                      <span className={tone.pill}>{tone.label}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.tool.summary}</p>
                    <p className="mt-1 text-[0.7rem] text-muted-foreground/80">
                      {planSummary(planByTool.get(entry.tool.id))}
                      {planByTool.get(entry.tool.id)?.notes.length ? ` — ${planByTool.get(entry.tool.id)!.notes[0]}` : ""}
                    </p>
                    {row?.message ? <p className="mt-1 text-xs text-muted-foreground/80">{row.message}</p> : null}
                    {entry.compatibility.reasons.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4 text-[0.7rem] text-muted-foreground/70">
                        {entry.compatibility.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    {busy ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${row?.percent ?? 8}%`, background: "linear-gradient(90deg, var(--genei-cyan), var(--genei-violet))" }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {busy ? (
                      <button type="button" className="gx-seg-btn" onClick={() => cancelMutation.mutate({ toolId: entry.tool.id })}>
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </button>
                    ) : status === "ready" ? (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--genei-green)]">
                        <CheckCircle2 className="h-4 w-4" /> Installed
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="gx-seg-btn"
                        disabled={installMutation.isPending || entry.compatibility.status === "unsupported"}
                        onClick={() => installMutation.mutate({ toolId: entry.tool.id, extract: true })}
                      >
                        <Circle className="h-3.5 w-3.5" /> Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Model weights ── */}
        <div className="gx-panel mt-6 p-4">
          <h3 className="font-display text-sm font-semibold">Model weights</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Sizes and links are read live from the Hugging Face Hub, so what is listed here is what would actually be downloaded. Nothing is
            fetched until you ask for it.
          </p>

          {weightsQuery.isLoading ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving the weight catalogue…
            </p>
          ) : null}

          <div className="mt-3 grid gap-2">
            {((weightsQuery.data ?? []) as WeightEntry[]).map((entry) => {
              const recommended = entry.files.filter((file) => file.recommended);
              return (
                <div key={entry.toolId} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <p className="text-xs font-semibold text-foreground">{entry.toolId}</p>
                  {entry.error ? (
                    <p className="mt-1 text-[0.7rem] text-muted-foreground">{entry.error}</p>
                  ) : (
                    <>
                      <p className="mt-1 text-[0.7rem] text-muted-foreground">{entry.files.length} file(s) available</p>
                      {recommended.map((file) => (
                        <p key={file.id} className="mt-1 font-mono text-[0.7rem] text-[var(--genei-cyan)]">
                          recommended · {file.path} · {formatSize(file.sizeBytes)}
                        </p>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            A tool that reports it needs a weights source can be completed by naming the repository here.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="genei-input min-w-0 flex-1 text-sm"
              placeholder="owner/repository on Hugging Face"
              value={weightRepo}
              onChange={(event) => setWeightRepo(event.target.value)}
            />
            <button
              type="button"
              className="gx-seg-btn gx-seg"
              disabled={resolveWeights.isPending || !weightRepo.trim()}
              onClick={() => resolveWeights.mutate({ repo: weightRepo.trim(), toolId: "user-supplied" })}
            >
              {resolveWeights.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Resolve
            </button>
          </div>
          {weightNote ? <p className="mt-2 text-xs text-muted-foreground">{weightNote}</p> : null}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          You can install or remove any of these later from the Model Library. Nothing is downloaded without you asking for it.
        </p>
      </div>
    </div>
  );
}
