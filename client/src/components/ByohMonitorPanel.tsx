import React from "react";
import { trpc } from "@/lib/trpc";
import { Cpu, HardDrive, ShieldCheck, Zap, Activity } from "lucide-react";

export function ByohMonitorPanel() {
  const { data: runners, isLoading, refetch } = trpc.runners.list.useQuery();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading workstation runners...</div>;
  }

  const list = runners ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> BYOH Workstation Telemetry
          </h2>
          <p className="text-xs text-muted-foreground">Real-time hardware heartbeats, VRAM, and tool readiness across your paired nodes.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/50"
        >
          Refresh Telemetry
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/10 p-8 text-center">
          <Cpu className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold text-foreground">No Workstations Paired</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Pair your first hardware workstation in API Integrations, then run the installer script to start streaming live telemetry and executing local inference tasks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((runner) => {
            let parsedHardware: { cpu_count?: number; gpu_count?: number; ram_mb?: number; gpus?: Array<{ name: string; vram_mb: string }>; tools?: Record<string, boolean> } = {};
            let toolList: string[] = [];
            try {
              const raw = runner.capabilities ? JSON.parse(runner.capabilities) : {};
              if (raw.hardware) parsedHardware = raw.hardware;
              if (Array.isArray(raw.tools)) toolList = raw.tools;
              else if (raw.tools) toolList = Object.keys(raw.tools).filter((k) => raw.tools[k]);
            } catch {
              // fallback
            }

            const isOnline = runner.status === "paired" && runner.lastHeartbeat && (Date.now() - new Date(runner.lastHeartbeat).getTime() < 120_000);

            return (
              <div key={runner.id} className="rounded-xl border border-border bg-card/60 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{runner.name}</h4>
                    <span className="text-[10px] text-muted-foreground">{runner.platform}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${isOnline ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                    {isOnline ? "Online & Healthy" : runner.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
                  <div className="rounded-lg bg-secondary/20 p-2 text-center">
                    <Cpu className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-[10px] text-muted-foreground">CPUs</div>
                    <div className="text-xs font-semibold text-foreground">{parsedHardware.cpu_count ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-secondary/20 p-2 text-center">
                    <HardDrive className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-[10px] text-muted-foreground">System RAM</div>
                    <div className="text-xs font-semibold text-foreground">{parsedHardware.ram_mb ? `${Math.round(parsedHardware.ram_mb / 1024)} GB` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-secondary/20 p-2 text-center">
                    <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-[10px] text-muted-foreground">GPUs / VRAM</div>
                    <div className="text-xs font-semibold text-foreground">
                      {parsedHardware.gpus && parsedHardware.gpus.length > 0 ? `${parsedHardware.gpus[0].vram_mb ? Math.round(Number(parsedHardware.gpus[0].vram_mb) / 1024) + " GB" : "Active"}` : "None"}
                    </div>
                  </div>
                </div>

                {parsedHardware.gpus && parsedHardware.gpus.length > 0 && (
                  <div className="text-[10px] text-muted-foreground bg-secondary/10 rounded p-2">
                    <span className="font-semibold text-foreground">GPU:</span> {parsedHardware.gpus.map((g) => `${g.name} (${g.vram_mb} MB VRAM)`).join(", ")}
                  </div>
                )}

                <div className="flex flex-wrap gap-1 pt-1">
                  {toolList.map((tool) => (
                    <span key={tool} className="rounded bg-secondary/30 px-2 py-0.5 text-[10px] text-foreground">
                      {tool}
                    </span>
                  ))}
                </div>

                <div className="text-[10px] text-muted-foreground pt-1 flex items-center justify-between border-t border-border/40">
                  <span>Last Heartbeat: {runner.lastHeartbeat ? new Date(runner.lastHeartbeat).toLocaleTimeString() : "Never"}</span>
                  <span className="text-primary font-mono">ID: #{runner.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
