import { useMemo, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Film, ListChecks, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import DagOrchestrationDashboard from "@/components/DagOrchestrationDashboard";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function DirectorConsole() {
  const [, navigate] = useLocation();
  const projectsQuery = trpc.projects.list.useQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const projectId = selectedProjectId ?? projectsQuery.data?.find((project) => project.type === "video")?.id ?? projectsQuery.data?.[0]?.id ?? null;
  const directorQuery = trpc.director.getProject.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null, refetchInterval: projectId !== null ? 3000 : false },
  );
  const nodeDetailsQuery = trpc.director.nodeDetails.useQuery(
    { projectId: projectId ?? 0, nodeId: selectedNodeId ?? "" },
    { enabled: projectId !== null && selectedNodeId !== null, refetchInterval: selectedNodeId ? 3000 : false },
  );
  const saveBoundary = trpc.director.saveBoundary.useMutation({ onSuccess: () => void directorQuery.refetch() });
  const controlProject = trpc.director.controlProject.useMutation({ onSuccess: () => void directorQuery.refetch() });

  // The job rows the Director actually recorded, not a client-side guess at them.
  const jobsQuery = trpc.director.jobs.useQuery({ projectId: projectId ?? undefined }, { enabled: projectId !== null, refetchInterval: projectId !== null ? 5000 : false });
  const updateJob = trpc.director.updateJob.useMutation({
    onSuccess: () => void jobsQuery.refetch(),
    onError: (error) => toast.error(error.message),
  });
  const saveQc = trpc.director.saveQc.useMutation({
    onSuccess: (result) => toast.message("Quality decision recorded", { description: `Report ${result.id} saved.` }),
    onError: (error) => toast.error(error.message),
  });

  const videoProjects = useMemo(() => projectsQuery.data?.filter((project) => project.type === "video") ?? [], [projectsQuery.data]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/video")} className="rounded-xl border border-border p-2 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label="Back to Video Studio"><ArrowLeft className="h-4 w-4" /></button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-pink-500 shadow-[0_0_20px_oklch(0.6_0.25_310_/_0.35)]"><Activity className="h-5 w-5 text-white" /></div>
          <div><h1 className="font-display text-2xl font-bold genei-gradient-text">Director Console</h1><p className="text-xs text-muted-foreground">Project Brain, DAG orchestration, continuity, QC, and render telemetry</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="genei-badge-purple">Live 3s polling</span><button type="button" onClick={() => directorQuery.refetch()} className="rounded-xl border border-border p-2 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label="Refresh orchestration"><RefreshCw className={`h-4 w-4 ${directorQuery.isFetching ? "animate-spin" : ""}`} /></button></div>
      </div>

      <div className="genei-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Film className="h-4 w-4 text-primary" />Select a production</div>
        {videoProjects.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No video projects yet. Start a continuity-aware production in Video Studio.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{videoProjects.map((project) => <button type="button" key={project.id} onClick={() => setSelectedProjectId(project.id)} className={`rounded-xl border p-3 text-left transition-all ${project.id === projectId ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/10 hover:border-primary/30"}`}><div className="text-sm font-semibold text-foreground">{project.title}</div><div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{project.description ?? "Continuity-aware production"}</div><div className="mt-2 text-[10px] text-primary">{project.status}</div></button>)}</div>}
      </div>

      {projectId !== null ? (
        <div className="genei-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />Director jobs
              <span className="text-[10px] font-normal text-muted-foreground">what the Director recorded, refreshed every 5s</span>
            </div>
            <button type="button" onClick={() => jobsQuery.refetch()} className="rounded-xl border border-border p-2 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label="Refresh jobs">
              <RefreshCw className={`h-4 w-4 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>

          {jobsQuery.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the job log…</div>
          ) : (jobsQuery.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No jobs have been recorded for this production yet. They appear as soon as the Director queues work.
            </div>
          ) : (
            <div className="grid gap-2">
              {(jobsQuery.data ?? []).slice(0, 12).map((job) => (
                <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/10 p-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {job.kind} · <span className="font-mono">{job.stage}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      job {job.id} · {job.status} · {job.progress}%{job.error ? ` · ${job.error.slice(0, 80)}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {job.status === "running" ? (
                      <button type="button" className="gx-seg-btn" onClick={() => updateJob.mutate({ id: job.id, status: "paused", stage: job.stage, progress: job.progress })}>Pause</button>
                    ) : null}
                    {job.status === "paused" ? (
                      <button type="button" className="gx-seg-btn" onClick={() => updateJob.mutate({ id: job.id, status: "queued", stage: job.stage, progress: job.progress })}>Resume</button>
                    ) : null}
                    {["queued", "running", "paused", "blocked"].includes(job.status) ? (
                      <button type="button" className="gx-seg-btn" onClick={() => updateJob.mutate({ id: job.id, status: "cancelled", stage: job.stage, progress: job.progress })}>Cancel</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedNodeId ? (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs font-semibold text-foreground">Record a quality decision for <span className="font-mono">{selectedNodeId}</span></div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                This writes a QC report against the selected subject so the decision is kept with the production rather than held in the browser.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="gx-seg-btn" disabled={saveQc.isPending} onClick={() => saveQc.mutate({ projectId: projectId ?? 0, subjectKey: selectedNodeId, passed: true, score: 100 })}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Pass
                </button>
                <button type="button" className="gx-seg-btn" disabled={saveQc.isPending} onClick={() => saveQc.mutate({ projectId: projectId ?? 0, subjectKey: selectedNodeId, passed: false, score: 0 })}>
                  <XCircle className="h-3.5 w-3.5" /> Fail
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {projectId !== null && <DagOrchestrationDashboard
        project={directorQuery.data}
        isFetching={directorQuery.isFetching}
        onSaveBoundary={(shotId, payload) => saveBoundary.mutate({ shotId, ...payload })}
        onPause={() => controlProject.mutate({ projectId, action: "pause" })}
        onResume={() => controlProject.mutate({ projectId, action: "resume" })}
        onCancel={() => controlProject.mutate({ projectId, action: "cancel" })}
        onStop={() => controlProject.mutate({ projectId, action: "stop" })}
        selectedNodeId={selectedNodeId}
        nodeDetails={nodeDetailsQuery.data}
        nodeDetailsLoading={nodeDetailsQuery.isFetching}
        onNodeSelect={setSelectedNodeId}
      />}
    </div>
  );
}
