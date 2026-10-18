import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Cloud,
  Cpu,
  HardDrive,
  Image,
  Loader2,
  Mic,
  Monitor,
  Music,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  Workflow,
  XCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { readDesktopStatus, type DesktopHardwareProfile, type DesktopStatus } from "@/lib/desktop";
import { trpc } from "@/lib/trpc";

type RunnerRow = { id: number; name: string; platform: string; status: string; lastHeartbeat: string | Date | null };

function RenderRunners() {
  const runnersQuery = trpc.runners.list.useQuery();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("linux");
  const [pairedToken, setPairedToken] = useState<string | null>(null);
  const [logRunnerId, setLogRunnerId] = useState<number | null>(null);

  const pair = trpc.runners.pair.useMutation({
    onSuccess: (result) => {
      // The token is shown once, exactly as the server says. It is not stored here.
      setPairedToken(result.token);
      setName("");
      void runnersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = trpc.runners.revoke.useMutation({
    onSuccess: () => { toast.message("Runner revoked"); void runnersQuery.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const logsQuery = trpc.runners.logs.useQuery(
    { runnerId: logRunnerId ?? 0, limit: 50 },
    { enabled: logRunnerId !== null },
  );

  const runners = (runnersQuery.data ?? []) as RunnerRow[];

  return (
    <div className="genei-card rounded-2xl p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Monitor className="h-4 w-4 text-primary" /> Render runners
        <span className="text-[10px] font-normal text-muted-foreground">another computer that does the heavy work</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A paired runner is a machine you own that renders jobs for this account. Pairing issues a token once; the runner sends it with every heartbeat.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input className="genei-input min-w-[10rem] flex-1 text-sm" placeholder="Runner name" value={name} onChange={(event) => setName(event.target.value)} />
        <select className="genei-input text-sm" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="linux">Linux</option>
          <option value="win32">Windows</option>
          <option value="darwin">macOS</option>
        </select>
        <button type="button" className="gx-cta" disabled={pair.isPending || !name.trim()} onClick={() => pair.mutate({ name: name.trim(), platform })}>
          {pair.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Pair
        </button>
      </div>

      {pairedToken ? (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3">
          <div className="text-[10px] font-semibold text-amber-200">Shown once — copy it now</div>
          <code className="mt-1 block break-all font-mono text-[10px] text-foreground">{pairedToken}</code>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {runners.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No runners are paired yet.</div>
        ) : (
          runners.map((runner) => (
            <div key={runner.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/10 p-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{runner.name} · {runner.platform}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {runner.status}
                  {runner.lastHeartbeat ? ` · last seen ${new Date(runner.lastHeartbeat).toLocaleString()}` : " · never seen"}
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button type="button" className="gx-seg-btn" onClick={() => setLogRunnerId(runner.id === logRunnerId ? null : runner.id)}>
                  {runner.id === logRunnerId ? "Hide logs" : "Logs"}
                </button>
                {runner.status !== "revoked" ? (
                  <button
                    type="button"
                    className="gx-seg-btn"
                    onClick={() => {
                      if (window.confirm(`Revoke "${runner.name}"? It will stop being able to send work.`)) revoke.mutate({ id: runner.id });
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {logRunnerId !== null ? (
        <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-border bg-black/20 p-3 font-mono text-[10px] text-muted-foreground">
          {logsQuery.isLoading ? "Loading…" : (logsQuery.data ?? []).length === 0 ? "No log entries for this runner." : (logsQuery.data ?? []).map((entry) => (
            <div key={entry.id}>{new Date(entry.createdAt).toLocaleTimeString()} · {entry.level} · {entry.message}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const capabilityTools = [
  { name: "Image generation", path: "/image", icon: Image, local: "GPU or CPU", cloud: "Managed gateway", accent: "oklch(0.72 0.18 210)" },
  { name: "Music creation", path: "/music", icon: Music, local: "CPU-ready", cloud: "BYOK providers", accent: "oklch(0.65 0.22 285)" },
  { name: "Video production", path: "/video", icon: Video, local: "GPU preferred", cloud: "Provider adapters", accent: "oklch(0.60 0.25 310)" },
  { name: "AI Director", path: "/director", icon: Sparkles, local: "CPU-ready", cloud: "Managed LLM", accent: "oklch(0.78 0.18 75)" },
  { name: "Visual workflows", path: "/comfy", icon: Workflow, local: "GPU preferred", cloud: "Hybrid routing", accent: "oklch(0.68 0.20 155)" },
  { name: "Voice & podcasts", path: "/voice", icon: Mic, local: "CPU-ready", cloud: "Speech providers", accent: "oklch(0.65 0.22 285)" },
];

function valueOrUnknown(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Not reported" : String(value);
}

function StatusBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${ready ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-border bg-secondary/40 text-muted-foreground"}`}>
      {ready ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function ByohDashboard() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [profile, setProfile] = useState<DesktopHardwareProfile | null>(null);
  const [checking, setChecking] = useState(true);

  const detect = async () => {
    setChecking(true);
    try {
      const nextStatus = await readDesktopStatus();
      setStatus(nextStatus);
      setProfile(nextStatus.hardware);
    } catch {
      setProfile({ status: "probe-error", message: "The internal probe could not complete. Cloud execution remains available." });
      toast.error("Hardware detection could not complete");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void detect();
  }, []);

  const localReady = profile?.status === "ready";
  const gpuReady = Boolean(profile?.gpu_count);
  const runtimeCount = useMemo(() => Object.values(profile?.runtimes ?? {}).filter(Boolean).length, [profile?.runtimes]);

  return (
    <div className="p-5 sm:p-7 max-w-[1400px] mx-auto space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="genei-card rounded-2xl p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-300">BUILT-IN HARDWARE & RUNTIME</span>
              <span className="text-xs text-muted-foreground">No runner. No pairing. No extra app.</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold font-display tracking-tight text-foreground">Your Genei computer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Genei detects this computer from inside the desktop application and automatically routes each tool to local hardware, your saved provider, or the managed fallback. This page is informational; it never asks you to install or pair another program.</p>
          </div>
          <button type="button" onClick={() => void detect()} disabled={checking} className="genei-btn-secondary inline-flex min-h-11 items-center justify-center gap-2 px-4 text-xs disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Refresh detection
          </button>
        </div>
      </motion.section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="genei-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Monitor className="h-4 w-4 text-cyan-300" /> Application</div><div className="mt-2 text-sm font-semibold text-foreground">{status?.product ?? "Genei AI Desktop"}</div><div className="mt-1 text-[11px] text-muted-foreground">{status?.packaged ? "Installed desktop build" : "Browser preview"}</div></div>
        <div className="genei-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Cpu className="h-4 w-4 text-purple-300" /> Processor</div><div className="mt-2 text-sm font-semibold text-foreground">{valueOrUnknown(profile?.cpu_count)} cores</div><div className="mt-1 truncate text-[11px] text-muted-foreground">{valueOrUnknown(profile?.processor)}</div></div>
        <div className="genei-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><HardDrive className="h-4 w-4 text-amber-300" /> Memory & disk</div><div className="mt-2 text-sm font-semibold text-foreground">{valueOrUnknown(profile?.memory_total_gb)} GB memory</div><div className="mt-1 text-[11px] text-muted-foreground">{valueOrUnknown(profile?.disk_free_gb)} GB free disk</div></div>
        <div className="genei-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4 text-emerald-300" /> Local readiness</div><div className="mt-2 text-sm font-semibold text-foreground">{checking ? "Checking…" : localReady ? "Detected" : "Cloud fallback"}</div><div className="mt-1 text-[11px] text-muted-foreground">{runtimeCount} optional runtimes found</div></div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="genei-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-5"><div><h2 className="text-lg font-bold font-display text-foreground">Choose a built-in capability</h2><p className="mt-1 text-xs text-muted-foreground">Open a studio. Genei handles the execution path automatically.</p></div><StatusBadge ready={localReady || profile?.status === "browser-preview"} label={profile?.status === "browser-preview" ? "Desktop probe on install" : localReady ? "Local path detected" : "Cloud path ready"} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {capabilityTools.map((tool) => (
              <Link key={tool.path} href={tool.path}>
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="group flex min-h-[122px] cursor-pointer items-center gap-4 rounded-xl border border-border bg-black/20 p-4 transition hover:border-primary/40 hover:bg-primary/5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tool.accent} / 0.15` }}><tool.icon className="h-5 w-5" style={{ color: tool.accent }} /></div>
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-foreground">{tool.name}</div><div className="mt-1 text-[11px] text-muted-foreground">Local: {tool.local}</div><div className="text-[11px] text-muted-foreground">Fallback: {tool.cloud}</div></div>
                  <span className="text-lg text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary">→</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="genei-card rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Automatic routing</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Genei prefers local execution when the required capability is detected. If not, it uses a configured provider or the managed gateway. You do not need to decide where a job runs.</p>
            <div className="mt-4 space-y-2"><StatusBadge ready={Boolean(profile?.status === "ready" || profile?.status === "browser-preview")} label="Hardware probe" /><StatusBadge ready={true} label="Cloud fallback" /><StatusBadge ready={gpuReady || profile?.status === "browser-preview"} label={gpuReady ? "GPU path" : "GPU path optional"} /></div>
          </div>
          <RenderRunners />
          <div className="genei-card rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Cloud className="h-4 w-4 text-sky-300" /> Optional local models</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Nothing is downloaded during first launch. The current build keeps local model installation optional while the cloud and BYOK paths remain available.</p>
            <Link href="/settings"><button type="button" className="mt-4 min-h-10 w-full rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15">Open advanced settings</button></Link>
          </div>
        </aside>
      </section>

      {checking && <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Reading the built-in capability profile…</div>}
    </div>
  );
}
