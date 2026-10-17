import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, Loader2, Cpu, Sparkles, XCircle, AlertTriangle, ArrowRight } from "lucide-react";

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

  useEffect(() => {
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

  const installMutation = trpc.tools.install.useMutation({
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
      await installMutation.mutateAsync({ toolId: entry.tool.id }).catch(() => undefined);
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
            <button type="button" className="gx-seg-btn gx-seg" disabled={installing} onClick={() => void installAll()}>
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Install all
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
                        onClick={() => installMutation.mutate({ toolId: entry.tool.id })}
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          You can install or remove any of these later from the Model Library. Nothing is downloaded without you asking for it.
        </p>
      </div>
    </div>
  );
}
