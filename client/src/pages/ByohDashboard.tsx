import React, { useState } from "react";
import { motion } from "framer-motion";
import { Monitor, Cpu, Activity, RefreshCw, Trash2, CheckCircle2, AlertCircle, Copy, Terminal, Shield, Download, HardDrive } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ByohDashboard() {
  const [runnerName, setRunnerName] = useState("");
  const [runnerPlatform, setRunnerPlatform] = useState("Windows");
  const [pairedToken, setPairedToken] = useState<string | null>(null);
  const [selectedRunnerId, setSelectedRunnerId] = useState<number | null>(null);

  const { data: runners, refetch: refetchRunners, isLoading } = trpc.runners.list.useQuery();
  const { data: artifacts } = trpc.downloads.listArtifacts.useQuery();
  const { data: runnerLogs, refetch: refetchLogs } = trpc.runners.logs.useQuery(
    { runnerId: selectedRunnerId ?? (runners?.[0]?.id || 0), limit: 50 },
    { enabled: !!selectedRunnerId || !!runners?.length }
  );

  const pairRunnerMutation = trpc.runners.pair.useMutation({
    onSuccess: (result) => {
      setPairedToken(result.token);
      setRunnerName("");
      refetchRunners();
      toast.success("BYOH workstation paired successfully!", { description: "Copy the pairing token and run the GeneiRunner.exe command below." });
    },
    onError: (err) => toast.error(err.message || "Failed to pair workstation"),
  });

  const revokeRunnerMutation = trpc.runners.revoke.useMutation({
    onSuccess: () => {
      refetchRunners();
      toast.success("Workstation runner revoked");
    },
  });

  const windowsArtifact = artifacts?.find((item) => item.platform === "win-x64");
  const activeRunner = runners?.find((r) => r.id === (selectedRunnerId ?? runners[0]?.id));

  return (
    <div className="p-5 max-w-[1400px] mx-auto space-y-7">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="genei-card p-6 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">BYOH HARDWARE STUDIO</span>
              <span className="text-xs text-muted-foreground">Local-first node orchestration</span>
            </div>
            <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">BYOH Windows Runner & Hardware Dashboard</h1>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Monitor connected local workstations in real time, inspect hardware capability telemetry, stream runner logs, and download the verified Windows executable directly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void refetchRunners(); toast.info("Refreshed workstation runner status"); }}
            className="genei-btn-secondary px-4 py-2 text-xs flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
          </button>
        </div>
      </motion.div>

      {/* Guided Setup & Direct Download Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="genei-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground font-display">1. Download Genei BYOH Runner (.exe)</h2>
              <p className="text-xs text-muted-foreground">Standalone Windows x64 executable compiled via GitHub Actions.</p>
            </div>
          </div>
          {windowsArtifact ? (
            <div className="p-4 rounded-xl border border-border bg-black/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground">{windowsArtifact.name}</div>
                  <div className="text-[10px] text-muted-foreground">Version: {windowsArtifact.version} · Size: {windowsArtifact.fileSize} · Signing: {windowsArtifact.signingState}</div>
                </div>
                <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/15 text-green-400 border border-green-500/30">Ready</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground bg-black/40 p-2 rounded truncate">SHA256: {windowsArtifact.sha256}</div>
              <button
                type="button"
                onClick={() => {
                  toast.success("Downloading GeneiRunner.exe in the background...", { description: "Your browser will save the file to your Downloads folder." });
                  const a = document.createElement("a");
                  a.href = windowsArtifact.downloadUrl;
                  a.download = "GeneiRunner.exe";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="genei-button-primary w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download GeneiRunner.exe (Background)
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                Download runs in the background. Keep this browser tab open until the transfer completes.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 space-y-2">
              <div className="text-xs font-semibold text-foreground">Windows Release Build Pending</div>
              <p className="text-[11px] text-muted-foreground">The runner executable is compiled from source on Windows. You can download the complete project source archive from Settings while the build is staged.</p>
            </div>
          )}
        </div>

        <div className="genei-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground font-display">2. Pair & Run on Workstation</h2>
              <p className="text-xs text-muted-foreground">Generate a secure pairing token and connect your hardware.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
              <input
                value={runnerName}
                onChange={(e) => setRunnerName(e.target.value)}
                placeholder="Workstation node name (e.g. RTX-4090-Node)"
                className="genei-input text-xs"
              />
              <button
                type="button"
                disabled={!runnerName.trim() || pairRunnerMutation.isPending}
                onClick={() => pairRunnerMutation.mutate({ name: runnerName.trim(), platform: runnerPlatform })}
                className="genei-button-primary py-2 rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {pairRunnerMutation.isPending ? "Pairing..." : "Generate Token"}
              </button>
            </div>
            {pairedToken && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2" aria-live="polite">
                <div className="text-xs font-semibold text-foreground">One-time pairing token (shown once):</div>
                <div className="flex gap-2">
                  <code className="flex-1 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-primary">{pairedToken}</code>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(pairedToken); toast.success("Token copied"); }}
                    className="rounded border border-border p-2 text-muted-foreground hover:text-foreground"
                    aria-label="Copy token"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="rounded bg-black/40 p-2 font-mono text-[10px] text-primary">
                  .\GeneiRunner.exe --server-url {window.location.origin} --token {pairedToken}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connected Runners Grid & Live Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground font-display text-sm">Registered Workstations</h3>
            <span className="text-xs text-muted-foreground">{runners?.length || 0} nodes</span>
          </div>
          {isLoading ? (
            <div className="genei-card p-8 text-center text-xs text-muted-foreground">Loading workstations...</div>
          ) : runners && runners.length > 0 ? (
            <div className="space-y-3">
              {runners.map((runner) => {
                const isOnline = runner.lastHeartbeat && Date.now() - new Date(runner.lastHeartbeat).getTime() < 120000;
                const isSelected = (selectedRunnerId ?? runners[0]?.id) === runner.id;
                return (
                  <div
                    key={runner.id}
                    onClick={() => setSelectedRunnerId(runner.id)}
                    className={`genei-card p-4 rounded-xl cursor-pointer transition-all border ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <Monitor className="w-4 h-4 text-primary" />
                        <div>
                          <div className="text-xs font-semibold text-foreground">{runner.name}</div>
                          <div className="text-[10px] text-muted-foreground">{runner.platform} · {runner.status}</div>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${isOnline ? "bg-green-500/15 text-green-400 border border-green-500/30" : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30"}`}>
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="genei-card p-6 rounded-xl text-center space-y-3">
              <Monitor className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
              <div className="text-xs font-semibold text-foreground">No workstations paired yet</div>
              <p className="text-[11px] text-muted-foreground">Generate a pairing token above and run your Windows executable to connect local hardware.</p>
            </div>
          )}
        </div>

        {/* Live Logs and Hardware Telemetry Panel */}
        <div className="lg:col-span-2 genei-card p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground font-display text-sm">Real-Time Runner Telemetry & Logs</h3>
            </div>
            <button
              type="button"
              onClick={() => { void refetchLogs(); toast.success("Refreshed runner logs"); }}
              className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Refresh Logs
            </button>
          </div>

          {activeRunner ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-border bg-black/30">
                  <div className="text-[10px] text-muted-foreground">Node Status</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5 uppercase">{activeRunner.status}</div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-black/30">
                  <div className="text-[10px] text-muted-foreground">Platform</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">{activeRunner.platform}</div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-black/30">
                  <div className="text-[10px] text-muted-foreground">Last Heartbeat</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">{activeRunner.lastHeartbeat ? new Date(activeRunner.lastHeartbeat).toLocaleTimeString() : "Never"}</div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-black/30">
                  <div className="text-[10px] text-muted-foreground">Action</div>
                  <button
                    type="button"
                    onClick={() => revokeRunnerMutation.mutate({ id: activeRunner.id })}
                    className="text-xs font-medium text-destructive hover:underline mt-0.5 block"
                  >
                    Revoke Runner
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">Activity & Heartbeat Log Stream</div>
                <div className="rounded-xl border border-border bg-black/50 p-4 font-mono text-[11px] h-64 overflow-y-auto space-y-2">
                  {runnerLogs && runnerLogs.length > 0 ? (
                    runnerLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 border-b border-border/40 pb-2">
                        <span className="text-muted-foreground text-[10px]">{new Date(log.createdAt).toLocaleTimeString()}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${log.level === "error" ? "bg-destructive/20 text-destructive" : log.level === "warn" ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"}`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="flex-1 text-foreground">{log.message}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-center py-10">Waiting for runner heartbeat activity... Run GeneiRunner.exe to begin streaming logs.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-xs text-muted-foreground">Select or pair a workstation runner to monitor live logs and hardware telemetry.</div>
          )}
        </div>
      </div>
    </div>
  );
}
