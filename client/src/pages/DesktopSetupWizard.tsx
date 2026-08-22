import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
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
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { getDesktopBridge, readDesktopStatus, type DesktopHardwareProfile, type DesktopStatus } from "@/lib/desktop";

const tools = [
  { label: "Create an image", detail: "Generate, edit, upscale, and remove backgrounds", icon: Image, path: "/image", accent: "oklch(0.72 0.18 210)" },
  { label: "Make music", detail: "Build lyrics, beats, voices, and complete tracks", icon: Music, path: "/music", accent: "oklch(0.65 0.22 285)" },
  { label: "Create a video", detail: "Plan scenes, maintain continuity, and render shots", icon: Video, path: "/video", accent: "oklch(0.60 0.25 310)" },
  { label: "Direct a production", detail: "Use the AI Director for scripts, scenes, and QC", icon: Sparkles, path: "/director", accent: "oklch(0.78 0.18 75)" },
  { label: "Build a workflow", detail: "Connect generation nodes in the visual graph studio", icon: Workflow, path: "/comfy", accent: "oklch(0.68 0.20 155)" },
  { label: "Create a voice", detail: "Record, transcribe, narrate, and produce podcasts", icon: Mic, path: "/voice", accent: "oklch(0.65 0.22 285)" },
];

function hardwareSummary(profile: DesktopHardwareProfile | null) {
  if (!profile) return "Waiting for the internal capability probe";
  if (profile.status === "browser-preview") return "Browser preview · local hardware access is available in Genei AI Desktop";
  if (profile.status !== "ready") return profile.message || "Cloud tools remain available while the local probe recovers";
  const cpu = profile.cpu_count ? `${profile.cpu_count} logical cores` : "CPU detected";
  const memory = profile.memory_total_gb ? `${profile.memory_total_gb} GB memory` : "memory detected";
  const gpu = profile.gpu_count ? `${profile.gpu_count} GPU${profile.gpu_count === 1 ? "" : "s"}` : "CPU execution";
  return `${cpu} · ${memory} · ${gpu}`;
}

export default function DesktopSetupWizard() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [profile, setProfile] = useState<DesktopHardwareProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [preference, setPreference] = useState<"auto" | "local" | "cloud">("auto");

  const refresh = async () => {
    setChecking(true);
    try {
      const nextStatus = await readDesktopStatus();
      setStatus(nextStatus);
      setProfile(nextStatus.hardware);
      if (nextStatus.hardware?.status === "ready") {
        toast.success("Genei detected this computer automatically");
      }
    } catch {
      setProfile({ status: "probe-error", message: "Genei could not complete the local probe; cloud tools remain available." });
      toast.error("Local detection is unavailable. Genei will use the secure cloud fallback.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const localReady = profile?.status === "ready" && Boolean(profile.gpu_count || profile.cpu_count);
  const runtimeLabel = useMemo(() => {
    if (checking) return "Detecting automatically";
    if (profile?.status === "browser-preview") return "Browser preview";
    if (localReady) return "Local execution ready";
    return "Cloud fallback ready";
  }, [checking, localReady, profile?.status]);

  return (
    <div className="p-5 sm:p-7 max-w-[1240px] mx-auto space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
        style={{ background: "linear-gradient(135deg, oklch(0.13 0.03 285), oklch(0.09 0.015 310), oklch(0.08 0.012 265))", border: "1px solid oklch(0.65 0.22 285 / 0.25)", boxShadow: "0 0 70px oklch(0.65 0.22 285 / 0.08)" }}
      >
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl opacity-20" style={{ background: "oklch(0.65 0.22 285)" }} />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="genei-badge-purple">Genei AI Desktop</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display text-foreground">Install once. Create immediately.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Genei detects your computer inside this application, chooses the best available execution path, and keeps cloud fallback ready. There is no separate runner, pairing token, command line, or hardware utility to install.
            </p>
          </div>
          <div className="min-w-[250px] rounded-2xl border border-primary/25 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Monitor className="h-4 w-4 text-primary" /> Automatic setup</div>
              {checking ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            </div>
            <div className="mt-3 text-xs font-semibold text-primary">{runtimeLabel}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hardwareSummary(profile)}</p>
            <button type="button" onClick={() => void refresh()} disabled={checking} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Refresh detection
            </button>
          </div>
        </div>
      </motion.section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="genei-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold font-display text-foreground">Choose what you want to make</h2>
              <p className="mt-1 text-xs text-muted-foreground">Every tool opens inside the same Genei workspace.</p>
            </div>
            <Zap className="h-5 w-5 text-amber-300" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <Link key={tool.path} href={tool.path}>
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="group flex min-h-[112px] cursor-pointer items-center gap-4 rounded-xl border border-border bg-black/20 p-4 transition hover:border-primary/40 hover:bg-primary/5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tool.accent} / 0.15` }}>
                    <tool.icon className="h-5 w-5" style={{ color: tool.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{tool.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.detail}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="genei-card rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Cpu className="h-4 w-4 text-cyan-300" /> Execution preference</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Automatic is recommended. This is a preference, not a setup step.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["auto", "local", "cloud"] as const).map((value) => (
                <button key={value} type="button" onClick={() => { setPreference(value); toast.success(value === "auto" ? "Genei will choose automatically" : `Genei will prefer ${value} execution`); }} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize transition ${preference === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {value === "auto" ? "Automatic" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="genei-card rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Nothing else is required</div>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span>Hardware detection is embedded in Genei AI Desktop.</span></div>
              <div className="flex items-start gap-2"><Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" /><span>Cloud fallback is available when local hardware is not ready.</span></div>
              <div className="flex items-start gap-2"><HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" /><span>Optional local model downloads are managed from inside the app.</span></div>
            </div>
            <Link href="/settings">
              <button type="button" className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15"><Download className="h-3.5 w-3.5" /> Advanced settings</button>
            </Link>
          </div>
        </aside>
      </section>

      {status?.packaged === false && profile?.status === "browser-preview" && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/80">
          This is the browser preview. The installed Genei AI Desktop build performs the same check with direct access to the computer’s hardware; this preview intentionally does not claim to inspect the host machine.
        </div>
      )}
    </div>
  );
}
