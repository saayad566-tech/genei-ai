import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Cpu, HardDrive, Download, CheckCircle2, Trash2, Zap, AlertTriangle } from "lucide-react";

/**
 * Local models.
 *
 * Choose, install, run, switch and remove a local LLM on the machine the user actually has.
 * Every recommendation is derived from measured RAM and VRAM, and every size is labelled an
 * estimate — the real figure comes from the file once it is on disk.
 */
export default function LocalModels() {
  const device = trpc.localModels.device.useQuery();
  const recommend = trpc.localModels.recommend.useQuery();
  const tooLarge = trpc.localModels.tooLarge.useQuery();
  const installed = trpc.localModels.installed.useQuery();
  const active = trpc.localModels.active.useQuery();
  const usage = trpc.localModels.usage.useQuery();
  const quantizations = trpc.localModels.quantizations.useQuery();

  const register = trpc.localModels.register.useMutation();
  const activate = trpc.localModels.switch.useMutation();
  const remove = trpc.localModels.remove.useMutation();
  const clean = trpc.localModels.cleanOrphans.useMutation();
  const bench = trpc.localModels.benchmark.useMutation();

  const [registerPath, setRegisterPath] = useState("");
  const [registerModel, setRegisterModel] = useState("");
  const [registerQuant, setRegisterQuant] = useState("Q4_K_M");
  const [note, setNote] = useState<string | null>(null);
  const [tokens, setTokens] = useState("100");
  const [elapsed, setElapsed] = useState("2000");

  async function refreshAll() {
    await Promise.all([installed.refetch(), active.refetch(), usage.refetch()]);
  }

  async function onRegister() {
    setNote(null);
    try {
      await register.mutateAsync({ modelId: registerModel, quant: registerQuant, filePath: registerPath.trim() });
      setNote("Installed.");
      await refreshAll();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not register that file.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Local models</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Run a language model on this machine. Recommendations come from your measured memory, not from
          what is newest — and every size shown is an estimate until the file is on disk.
        </p>
      </header>

      {/* Device */}
      {device.data && (
        <section className="gx-panel mb-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4 text-primary" /> This machine
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            {[
              ["RAM", `${device.data.ramGB} GB`],
              ["VRAM", device.data.vramGB > 0 ? `${device.data.vramGB} GB` : "none detected"],
              ["Cores", String(device.data.cores)],
              ["Accelerator", device.data.accelerator],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Active model */}
      <section className="gx-panel mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-primary" /> Active model
        </h2>
        {active.data ? (
          <div className="text-sm">
            <p className="font-medium">
              {active.data.model.name} <span className="text-muted-foreground">· {active.data.quant}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {active.data.tuning.threads} threads · {active.data.tuning.gpuLayers > 0 ? "GPU offload" : "CPU only"} ·{" "}
              {active.data.tuning.contextTokens} context
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {active.data.tuning.rationale.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No model installed yet. Register a downloaded file below — nothing is downloaded for you.
          </p>
        )}
      </section>

      {/* Recommendations */}
      <section className="gx-panel mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Download className="h-4 w-4 text-primary" /> Recommended for this machine
        </h2>
        <ul className="space-y-2">
          {(recommend.data ?? []).map((fit) => (
            <li key={fit.model.id} className="rounded-md border border-border/50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{fit.model.name}</span>
                <span className="text-xs text-muted-foreground">
                  {fit.quant} · ~{fit.requiredGB} GB · {fit.runsOn === "gpu" ? "GPU" : "CPU"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{fit.explanation}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {fit.model.strengths.map((s) => (
                  <span key={s} className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {recommend.isSuccess && (recommend.data ?? []).length === 0 && (
            <li className="text-xs text-amber-300">
              No catalogue model fits this machine. See what would be needed below.
            </li>
          )}
        </ul>

        {(tooLarge.data ?? []).length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Too large for this machine
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {(tooLarge.data ?? []).map((entry) => (
                <li key={entry.model.id}>
                  {entry.model.name} — needs ~{entry.needsGB} GB at its smallest
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Installed */}
      <section className="gx-panel mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4 text-primary" /> Installed
        </h2>

        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <select
            value={registerModel}
            onChange={(e) => setRegisterModel(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Model…</option>
            {(recommend.data ?? []).map((fit) => (
              <option key={fit.model.id} value={fit.model.id}>{fit.model.name}</option>
            ))}
          </select>
          <select
            value={registerQuant}
            onChange={(e) => setRegisterQuant(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {(quantizations.data ?? []).map((q) => (
              <option key={q.id} value={q.id}>{q.label}</option>
            ))}
          </select>
          <Input value={registerPath} onChange={(e) => setRegisterPath(e.target.value)} placeholder="/path/to/model.gguf" className="sm:col-span-2" />
        </div>
        <Button onClick={onRegister} disabled={register.isPending || !registerModel || !registerPath.trim()}>
          {register.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Register downloaded file
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          The file is inspected before it is accepted: a truncated download or an error page saved under a
          .gguf name is refused here rather than failing later at load time.
        </p>

        <ul className="mt-4 space-y-1.5">
          {(installed.data?.installed ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {installed.data?.activeId === entry.id && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                <span className="font-mono text-xs">{entry.id}</span>
                <span className="text-xs text-muted-foreground">{(entry.sizeBytes / 1024 ** 3).toFixed(2)} GB</span>
              </span>
              <span className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={installed.data?.activeId === entry.id}
                  onClick={async () => { await activate.mutateAsync({ id: entry.id }); await refreshAll(); }}
                >
                  Use
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => { await remove.mutateAsync({ id: entry.id, deleteFile: false }); await refreshAll(); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
          {installed.isSuccess && (installed.data?.installed ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">Nothing installed.</li>
          )}
        </ul>

        {usage.data && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{usage.data.totalGB} GB installed</span>
            {usage.data.orphanBytes > 0 && (
              <>
                <span>{(usage.data.orphanBytes / 1024 ** 3).toFixed(2)} GB orphaned</span>
                <Button variant="outline" size="sm" onClick={async () => { await clean.mutateAsync(); await refreshAll(); }}>
                  Clean up
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Benchmark */}
      <section className="gx-panel p-5">
        <h2 className="mb-3 text-sm font-medium">Throughput</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder="tokens" className="w-28" />
          <Input value={elapsed} onChange={(e) => setElapsed(e.target.value)} placeholder="elapsed ms" className="w-32" />
          <Button
            variant="outline"
            onClick={() => bench.mutate({ tokens: Number(tokens) || 0, elapsedMs: Number(elapsed) || 0 })}
            disabled={bench.isPending}
          >
            Compute
          </Button>
        </div>
        {bench.data && (
          <p className="mt-2 text-sm">
            <span className="font-medium">{bench.data.tokensPerSecond} tok/s</span>
            <span className="ml-2 text-xs text-muted-foreground">{bench.data.note}</span>
          </p>
        )}
        {bench.error && <p className="mt-2 text-xs text-red-300">{bench.error.message}</p>}
      </section>

      {note && <p className="mt-4 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">{note}</p>}
    </div>
  );
}
