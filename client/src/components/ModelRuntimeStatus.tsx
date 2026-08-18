import React, { useEffect, useMemo, useState } from "react";
import { Cpu, Download, Globe2, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

function useAndroidRuntime() {
  const [runtime, setRuntime] = useState({ webGpu: false, storage: false, online: true });

  useEffect(() => {
    const update = () => setRuntime({
      webGpu: typeof navigator !== "undefined" && "gpu" in navigator,
      storage: typeof navigator !== "undefined" && "storage" in navigator,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
    });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return runtime;
}

export function ModelRuntimeStatus() {
  const { isAuthenticated } = useAuth();
  const runtime = useAndroidRuntime();
  const capabilityInput = useMemo(() => ({ runtime }), [runtime]);
  const capabilities = trpc.ai.capabilities.useQuery(capabilityInput, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const modelCount = capabilities.data?.models.length ?? 0;
  const mode = useMemo(() => {
    if (!isAuthenticated) return "Sign in to connect models";
    if (!runtime.online) return "Offline shell active";
    if (capabilities.isLoading) return "Checking model gateway";
    if (capabilities.isError) return "Gateway needs configuration";
    return runtime.webGpu && runtime.storage
      ? "Optional on-device path detected; server fallback ready"
      : "Android-ready server routing";
  }, [capabilities.isError, capabilities.isLoading, isAuthenticated, runtime.online, runtime.storage, runtime.webGpu]);

  return (
    <section className="genei-card rounded-2xl p-4 sm:p-5" aria-labelledby="model-runtime-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="model-runtime-title" className="font-display text-base font-semibold text-foreground">Model runtime</h2>
            <p className="mt-1 text-xs text-muted-foreground">{mode}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${runtime.online ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
          {runtime.online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <RuntimeMetric icon={Globe2} label="Server models" value={isAuthenticated ? String(modelCount) : "—"} />
        <RuntimeMetric icon={Cpu} label="WebGPU" value={runtime.webGpu ? "Available" : "Fallback"} />
        <RuntimeMetric icon={Download} label="Offline shell" value={runtime.storage ? "Ready" : "Limited"} />
        <RuntimeMetric icon={Cpu} label="On-device" value={runtime.webGpu && runtime.storage ? "Eligible" : "Gated"} />
        <RuntimeMetric icon={Smartphone} label="Android" value="Supported" />
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Large models run securely through Genei's server gateway on Android. Optional lightweight on-device inference is offered only when browser WebGPU and storage capabilities are present; it never blocks the reliable server fallback.
      </p>
    </section>
  );
}

function RuntimeMetric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <div className="mt-2 truncate text-xs font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
