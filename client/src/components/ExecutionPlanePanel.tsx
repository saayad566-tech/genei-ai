import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Server, Stethoscope } from "lucide-react";

type SystemMemory = { totalMB: number; freeMB: number; swapTotalMB: number; swapFreeMB: number };

type DesktopBridge = { systemMemory?: () => Promise<SystemMemory | null> };

type QueueSnapshot = {
  running: Array<{ id: string; label: string }>;
  queued: Array<{ id: string; label: string; estimatedPeakMB: number }>;
  budget: { ramBudgetMB: number; vramBudgetMB: number; maxConcurrentHeavyJobs: number };
  reservedMB: number;
  paused: boolean;
  pauseReason: string | null;
};

type AdapterStatus = {
  state: string;
  message: string;
  toolId: string;
  detail?: Record<string, string | number | boolean>;
};

const CAPABILITIES = ["video_generation", "review", "assemble", "lipsync", "upscale", "transcribe"] as const;

function statePill(state: string): { className: string; label: string } {
  switch (state) {
    case "ready":
      return { className: "gx-pill gx-pill--ready", label: "Ready" };
    case "degraded":
      return { className: "gx-pill gx-pill--pending", label: "Degraded" };
    case "stopped":
      return { className: "gx-pill gx-pill--pending", label: "Stopped" };
    case "not_installed":
      return { className: "gx-pill gx-pill--info", label: "Not installed" };
    case "needs_source":
      return { className: "gx-pill gx-pill--pending", label: "Needs source" };
    case "failed":
    case "unsupported":
      return { className: "gx-pill gx-pill--blocked", label: state === "failed" ? "Failed" : "Unsupported" };
    default:
      return { className: "gx-pill gx-pill--info", label: state };
  }
}

/**
 * Execution-plane status and the proof-scene gate.
 *
 * Health here is a live probe of each tool, so what you see is what is actually
 * running on this computer right now — not a cached claim.
 */
export function ExecutionPlanePanel() {
  const [workflowJson, setWorkflowJson] = useState("");
  const [promptA, setPromptA] = useState("");
  const [promptB, setPromptB] = useState("");
  const [report, setReport] = useState<{ verdict: string; summary: string; steps: Array<{ id: string; title: string; status: string; detail: string }> } | null>(null);

  const healthQuery = trpc.adapters.health.useQuery(undefined, { refetchOnWindowFocus: false });
  const resolutions = trpc.useQueries((t) => CAPABILITIES.map((capability) => t.adapters.resolve({ capability })));
  const [selfTest, setSelfTest] = useState<{ verdict: string; summary: string; hardware: { gpu: string; vramGB: number | null; ramGB: number | null; backends: string[]; notes: string[] }; steps: Array<{ id: string; title: string; status: string; detail: string }> } | null>(null);
  const selfTestMutation = trpc.adapters.selfTest.useMutation({
    onSuccess: (result) => {
      setSelfTest(result as unknown as typeof selfTest);
      toast.message(`Self-test: ${result.verdict}`, { description: result.summary.slice(0, 160) });
    },
    onError: (error) => toast.error(error.message),
  });
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [contextUrl, setContextUrl] = useState("");
  const [contextResult, setContextResult] = useState<{ status: string; detail: string } | null>(null);

  const hardwareQuery = trpc.adapters.hardware.useQuery(undefined, { refetchOnWindowFocus: false });
  const queueQuery = trpc.queue.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const data = query.state.data as QueueSnapshot | undefined;
      return data && (data.running.length > 0 || data.queued.length > 0) ? 2500 : false;
    },
  });
  const configureQueue = trpc.queue.configure.useMutation({
    onSuccess: (snapshot) => {
      const data = snapshot as unknown as QueueSnapshot;
      setQueueNote(`Sized to this machine: ${data.budget.ramBudgetMB} MB RAM budget, ${data.budget.vramBudgetMB} MB VRAM budget.`);
      void queueQuery.refetch();
    },
    onError: (error) => setQueueNote(error.message),
  });
  const reportPressure = trpc.queue.reportPressure.useMutation({
    onSuccess: (snapshot) => {
      const data = snapshot as unknown as QueueSnapshot;
      setQueueNote(data.paused ? `Paused: ${data.pauseReason ?? "memory pressure"}` : "Memory is healthy; admission is open.");
      void queueQuery.refetch();
    },
    onError: (error) => setQueueNote(error.message),
  });
  const cancelQueued = trpc.queue.cancel.useMutation({ onSuccess: () => void queueQuery.refetch() });
  const gatherContext = trpc.director.gatherContext.useMutation({
    onSuccess: (data) => {
      const result = data.result as { status: string; reason?: string; title?: string; text?: string; url?: string };
      setContextResult({
        status: result.status,
        detail:
          result.status === "ok"
            ? `${result.title ?? result.url} — ${(result.text ?? "").slice(0, 240)}`
            : result.reason ?? "No live context is available.",
      });
    },
    onError: (error) => setContextResult({ status: "error", detail: error.message }),
  });
  const proofMutation = trpc.adapters.runProof.useMutation({
    onSuccess: (result) => {
      setReport(result as unknown as typeof report);
      toast.message(`Proof ${result.verdict}`, { description: result.summary.slice(0, 160) });
    },
    onError: (error) => toast.error(error.message),
  });

  const health = (healthQuery.data ?? []) as AdapterStatus[];

  return (
    <section className="gx-panel p-5" data-testid="execution-plane">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-[var(--genei-cyan)]" />
          <div>
            <h2 className="font-display text-base font-semibold">Execution plane</h2>
            <p className="text-xs text-muted-foreground">Live probe of the tools that actually render, review and assemble.</p>
          </div>
        </div>
        <button type="button" className="gx-seg-btn gx-seg" onClick={() => void healthQuery.refetch()} disabled={healthQuery.isFetching}>
          {healthQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Re-probe
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {healthQuery.isLoading ? <p className="text-xs text-muted-foreground">Probing…</p> : null}
        {health.map((entry) => {
          const pill = statePill(entry.state);
          return (
            <div key={entry.toolId} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{entry.toolId}</span>
                  <span className={pill.className}>{pill.label}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {resolutions.map((query, index) => {
          const capability = CAPABILITIES[index];
          const data = query.data as { adapterId: string | null; fellBack: boolean; considered: Array<{ adapterId: string; state: string }> } | undefined;
          return (
            <div key={capability} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">{capability.replace(/_/g, " ")}</p>
              <p className="mt-1 font-mono text-xs text-foreground">{data?.adapterId ?? "none available"}</p>
              {data?.fellBack ? <p className="mt-1 text-[0.65rem] text-[var(--genei-gold)]">Using a fallback, not the first preference.</p> : null}
              {!data?.adapterId && data ? (
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {data.considered.map((entry) => `${entry.adapterId}: ${entry.state}`).join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Resource queue ── */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold">Resource queue</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Heavy work runs one job at a time. A job too large for the remaining budget waits instead of being attempted and crashing the machine.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="gx-seg-btn gx-seg"
              disabled={configureQueue.isPending || !hardwareQuery.data}
              onClick={() => {
                const hardware = hardwareQuery.data as { ramGB: number | null; vramGB: number | null } | undefined;
                if (!hardware?.ramGB) {
                  setQueueNote("This machine's memory could not be read, so the budget was left as it is.");
                  return;
                }
                configureQueue.mutate({ ramGB: hardware.ramGB, vramGB: hardware.vramGB ?? undefined });
              }}
            >
              Size to this machine
            </button>
            <button
              type="button"
              className="gx-seg-btn gx-seg"
              disabled={reportPressure.isPending}
              onClick={async () => {
                const bridge = (window as unknown as { geneiDesktop?: DesktopBridge }).geneiDesktop;
                if (!bridge?.systemMemory) {
                  setQueueNote("Memory pressure is reported by the desktop app; it is not available in a browser.");
                  return;
                }
                const memory = await bridge.systemMemory().catch(() => null);
                if (!memory) {
                  setQueueNote("The system memory reading was unavailable.");
                  return;
                }
                reportPressure.mutate({ freeRamMB: memory.freeMB });
              }}
            >
              Report memory
            </button>
          </div>
        </div>

        {queueNote ? <p className="mt-2 text-xs text-muted-foreground">{queueNote}</p> : null}

        {queueQuery.data ? (
          <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={queueQuery.data.paused ? "gx-pill gx-pill--pending" : "gx-pill gx-pill--ready"}>
                {queueQuery.data.paused ? "paused" : "open"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {queueQuery.data.running.length} running · {queueQuery.data.queued.length} waiting · {queueQuery.data.reservedMB} MB reserved · budget{" "}
                {queueQuery.data.budget.ramBudgetMB} MB RAM / {queueQuery.data.budget.vramBudgetMB} MB VRAM · max {queueQuery.data.budget.maxConcurrentHeavyJobs} heavy
              </span>
            </div>
            {queueQuery.data.pauseReason ? <p className="mt-1 text-xs text-[var(--genei-gold)]">{queueQuery.data.pauseReason}</p> : null}
            {queueQuery.data.queued.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {queueQuery.data.queued.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
                    <span>
                      {job.label} · {job.estimatedPeakMB} MB
                    </span>
                    <button type="button" className="gx-seg-btn" onClick={() => cancelQueued.mutate({ jobId: job.id })}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Live context ── */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <h3 className="font-display text-sm font-semibold">Live context</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Fetch a page so a model can ground on current information instead of relying on what it remembers.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="genei-input min-w-0 flex-1 text-sm"
            placeholder="https://…"
            value={contextUrl}
            onChange={(event) => setContextUrl(event.target.value)}
          />
          <button
            type="button"
            className="gx-seg-btn gx-seg"
            disabled={gatherContext.isPending || !contextUrl.trim()}
            onClick={() => gatherContext.mutate({ url: contextUrl.trim() })}
          >
            {gatherContext.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Fetch
          </button>
        </div>
        {contextResult ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className={contextResult.status === "ok" ? "text-[var(--genei-green)]" : "text-[var(--genei-gold)]"}>{contextResult.status}</span>{" "}
            {contextResult.detail}
          </p>
        ) : null}
      </div>

      {/* ── Readiness self-test ── */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold">Readiness self-test</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Detects this machine for real, probes every adapter, encodes and validates an actual clip, and checks the reviewer. Run this on the
              machine that will do the rendering.
            </p>
          </div>
          <button
            type="button"
            className="gx-seg-btn gx-seg"
            disabled={selfTestMutation.isPending}
            onClick={() => selfTestMutation.mutate({})}
          >
            {selfTestMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />} Run self-test
          </button>
        </div>

        {selfTest ? (
          <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={selfTest.verdict === "ready" ? "gx-pill gx-pill--ready" : selfTest.verdict === "degraded" ? "gx-pill gx-pill--pending" : "gx-pill gx-pill--blocked"}>
                {selfTest.verdict.replace("_", " ")}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {selfTest.hardware.gpu}
                {selfTest.hardware.vramGB ? ` · ${selfTest.hardware.vramGB} GB VRAM` : ""}
                {selfTest.hardware.ramGB ? ` · ${selfTest.hardware.ramGB} GB RAM` : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{selfTest.summary}</p>
            <ul className="mt-2 space-y-1">
              {selfTest.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-2 text-[0.7rem]">
                  <span
                    className={
                      step.status === "passed"
                        ? "text-[var(--genei-green)]"
                        : step.status === "blocked"
                          ? "text-[var(--genei-gold)]"
                          : step.status === "skipped"
                            ? "text-muted-foreground"
                            : "text-[var(--genei-pink)]"
                    }
                  >
                    {step.status}
                  </span>
                  <span className="text-muted-foreground">
                    {step.title} — {step.detail}
                  </span>
                </li>
              ))}
            </ul>
            {selfTest.hardware.notes.length > 0 ? (
              <p className="mt-2 text-[0.65rem] text-muted-foreground/80">{selfTest.hardware.notes.join(" ")}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Proof scene ── */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <h3 className="font-display text-sm font-semibold">Proof scene</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Two connected shots, multiple takes, a reviewer decision, a continuity check and an assembly — run on the tools installed here. Long-form
          production should not be trusted until this passes.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="genei-input text-sm" placeholder="Shot 1 prompt" value={promptA} onChange={(event) => setPromptA(event.target.value)} />
          <input className="genei-input text-sm" placeholder="Shot 2 prompt (continues shot 1)" value={promptB} onChange={(event) => setPromptB(event.target.value)} />
        </div>
        <textarea
          className="genei-input mt-2 w-full resize-none font-mono text-xs"
          rows={4}
          placeholder='Paste a ComfyUI workflow (API format) — use {{positive}}, {{negative}}, {{seed}}, {{width}}, {{height}}, {{frames}} placeholders'
          value={workflowJson}
          onChange={(event) => setWorkflowJson(event.target.value)}
        />
        <button
          type="button"
          className="gx-cta mt-3"
          disabled={proofMutation.isPending || !workflowJson.trim() || !promptA.trim() || !promptB.trim()}
          onClick={() => proofMutation.mutate({ workflowJson, promptA, promptB })}
        >
          {proofMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {proofMutation.isPending ? "Running proof…" : "Run proof scene"}
        </button>

        {report ? (
          <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              {report.verdict === "passed" ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--genei-green)]" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-[var(--genei-gold)]" />
              )}
              <span className="text-sm font-semibold">{report.verdict}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{report.summary}</p>
            <ul className="mt-2 space-y-1">
              {report.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-2 text-[0.7rem]">
                  <span className={step.status === "passed" ? "text-[var(--genei-green)]" : step.status === "blocked" ? "text-[var(--genei-gold)]" : "text-[var(--genei-pink)]"}>
                    {step.status}
                  </span>
                  <span className="text-muted-foreground">{step.title} — {step.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
