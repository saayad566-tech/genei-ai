import { useMemo, useState } from "react";
import { Activity, ArrowLeft, Film, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import DagOrchestrationDashboard from "@/components/DagOrchestrationDashboard";
import { trpc } from "@/lib/trpc";

export default function DirectorConsole() {
  const [, navigate] = useLocation();
  const projectsQuery = trpc.projects.list.useQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const projectId = selectedProjectId ?? projectsQuery.data?.find((project) => project.type === "video")?.id ?? projectsQuery.data?.[0]?.id ?? null;
  const directorQuery = trpc.director.getProject.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null, refetchInterval: projectId !== null ? 3000 : false },
  );
  const saveBoundary = trpc.director.saveBoundary.useMutation({ onSuccess: () => void directorQuery.refetch() });
  const controlProject = trpc.director.controlProject.useMutation({ onSuccess: () => void directorQuery.refetch() });

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

      {projectId !== null && <DagOrchestrationDashboard
        project={directorQuery.data}
        isFetching={directorQuery.isFetching}
        onSaveBoundary={(shotId, payload) => saveBoundary.mutate({ shotId, ...payload })}
        onPause={() => controlProject.mutate({ projectId, action: "pause" })}
        onResume={() => controlProject.mutate({ projectId, action: "resume" })}
        onCancel={() => controlProject.mutate({ projectId, action: "cancel" })}
        onStop={() => controlProject.mutate({ projectId, action: "stop" })}
      />}
    </div>
  );
}
