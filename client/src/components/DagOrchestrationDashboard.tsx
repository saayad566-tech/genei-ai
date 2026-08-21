import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Circle, Clock3, GitBranch, Loader2, Pause, Play, RotateCcw, ServerCog, Square, Workflow, X, Globe } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";

type DirectorData = {
  project: { id: number; title: string; status: string; metadata: string | null };
  scenes: Array<{ id: number; sceneKey: string; sceneIndex: number; title: string; status: string; objective: string | null; location: string | null }>;
  shots: Array<{ id: number; sceneId: number; shotKey: string; sequenceIndex: number; status: string; prompt: string; routeUsed: string | null; qaScore: number | null; startContinuity: string | null; endContinuity: string | null }>;
  jobs: Array<{ id: number; sceneId: number | null; shotId: number | null; kind: string; stage: string; status: string; progress: number; error: string | null; attempt: number | null; updatedAt: Date | string }>;
  qc: Array<{ id: number; subjectKey: string; passed: boolean; score: number; findings: string | null }>;
  dag: {
    nodes: Array<{ id: string; kind: "project" | "scene" | "shot" | "job"; label: string; status: string; progress: number; sceneId?: number; shotId?: number; jobId?: number }>;
    edges: Array<{ id: string; source: string; target: string; kind: "contains" | "dependency" | "assembly" | "execution" }>;
  };
};

type BoundaryPayload = { startContinuity?: Record<string, unknown>; endContinuity?: Record<string, unknown>; status?: "needs_review" | "approved" };

type Props = {
  project: DirectorData | null | undefined;
  isFetching?: boolean;
  onRetry?: (shotId: number) => void;
  onSaveBoundary?: (shotId: number, payload: BoundaryPayload) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onStop?: () => void;
  selectedNodeId?: string | null;
  nodeDetails?: { node: { id: string; kind: string; label: string; status: string; progress: number; [key: string]: unknown }; jobs: Array<{ id: number; stage: string; status: string; progress: number; error: string | null; attempt: number | null; updatedAt: Date | string }>; logs: Array<{ id: number; level: string; message: string; metadata: string | null; createdAt: Date | string }>; assets: Array<{ id: number; kind: string; source: string; storageUrl: string; mimeType: string | null; sizeBytes: number | null; metadata: string | null; createdAt: Date | string }> } | null;
  nodeDetailsLoading?: boolean;
  onNodeSelect?: (nodeId: string | null) => void;
};

const stageLabels = [
  { id: "planning", label: "Plan" },
  { id: "scene_analysis", label: "Analyze" },
  { id: "shot_generation", label: "Generate" },
  { id: "continuity_qc", label: "Continuity QC" },
  { id: "scene_render", label: "Render" },
  { id: "export", label: "Export" },
];

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === "completed" || value === "approved" || value === "generated") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/5";
  if (value === "running" || value === "generating" || value === "processing") return "text-primary border-primary/30 bg-primary/5";
  if (value === "failed" || value === "blocked") return "text-red-300 border-red-500/30 bg-red-500/5";
  if (value === "paused" || value === "cancelled" || value === "needs_review") return "text-amber-200 border-amber-500/30 bg-amber-500/5";
  return "text-muted-foreground border-border bg-secondary/10";
}

function statusIcon(status: string) {
  const value = status.toLowerCase();
  if (value === "completed" || value === "approved" || value === "generated") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (value === "running" || value === "generating" || value === "processing") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (value === "failed" || value === "blocked") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5" />;
}

const continuityFieldLabels = [
  ["character.action_phase", "Action phase"],
  ["character.gaze", "Gaze"],
  ["character.wardrobe", "Wardrobe"],
  ["world.location_description", "Location"],
  ["world.weather", "Weather"],
  ["camera.axis", "Camera axis"],
  ["audio.timecode_ms", "Audio cursor"],
] as const;

type ContinuityDraft = Record<string, { start: string; end: string; locked: boolean }>;

function parseBoundary(value: string | null): Record<string, any> {
  if (!value) return {};
  try { return JSON.parse(value) as Record<string, any>; } catch { return {}; }
}

function readBoundaryField(boundary: Record<string, any>, key: string): string {
  const [group, field] = key.split(".");
  if (group === "character") return String(boundary.characters?.[0]?.[field] ?? "unknown");
  return String(boundary[group]?.[field] ?? "unknown");
}

function draftFromShot(shot: DirectorData["shots"][number]): ContinuityDraft {
  const start = parseBoundary(shot.startContinuity);
  const end = parseBoundary(shot.endContinuity);
  return Object.fromEntries(continuityFieldLabels.map(([key]) => [key, { start: readBoundaryField(start, key), end: readBoundaryField(end, key), locked: false }])) as ContinuityDraft;
}

function boundaryFromDraft(draft: ContinuityDraft, side: "start" | "end") {
  const result: Record<string, any> = { characters: [{}], world: {}, camera: {}, audio: {} };
  for (const [key, values] of Object.entries(draft)) {
    const [group, field] = key.split(".");
    const value = values[side] === "unknown" ? undefined : values[side];
    if (value === undefined) continue;
    if (group === "character") result.characters[0][field] = value;
    else if (group === "audio") result.audio[field] = field === "timecode_ms" ? Number(value) || 0 : value;
    else result[group][field] = value;
  }
  return result;
}

function progressForStage(jobs: DirectorData["jobs"], stageId: string) {
  const matching = jobs.filter((job) => job.stage === stageId);
  if (!matching.length) return { progress: 0, status: "queued" };
  const progress = Math.round(matching.reduce((sum, job) => sum + job.progress, 0) / matching.length);
  const status = matching.some((job) => job.status === "failed" || job.status === "blocked") ? "blocked" : matching.some((job) => job.status === "running") ? "running" : matching.every((job) => job.status === "completed") ? "completed" : "queued";
  return { progress, status };
}

export default function DagOrchestrationDashboard({ project, isFetching = false, onRetry, onSaveBoundary, onPause, onResume, onCancel, onStop, selectedNodeId, nodeDetails, nodeDetailsLoading = false, onNodeSelect }: Props) {
  const [locale, setLocale] = useState<Locale>("en");
  const [internalSelectedNode, setInternalSelectedNode] = useState<string | null>(null);
  const selectedNode = selectedNodeId === undefined ? internalSelectedNode : selectedNodeId;
  const [inspectorShotId, setInspectorShotId] = useState<number | null>(null);
  const [continuityDraft, setContinuityDraft] = useState<ContinuityDraft | null>(null);
  const jobs = project?.jobs ?? [];
  const scenes = project?.scenes ?? [];
  const shots = project?.shots ?? [];
  const inspectorShot = shots.find((shot) => shot.id === inspectorShotId) ?? null;
  useEffect(() => {
    if (inspectorShot) setContinuityDraft(draftFromShot(inspectorShot));
    else setContinuityDraft(null);
  }, [inspectorShot?.id, inspectorShot?.startContinuity, inspectorShot?.endContinuity]);
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const runningJobs = jobs.filter((job) => job.status === "running" || job.status === "processing").length;
  const blockedJobs = jobs.filter((job) => job.status === "blocked" || job.status === "failed").length;
  const averageProgress = jobs.length ? Math.round(jobs.reduce((sum, job) => sum + job.progress, 0) / jobs.length) : 0;
  const qcScore = project?.qc.length ? Math.round(project.qc.reduce((sum, report) => sum + report.score, 0) / project.qc.length) : null;

  const latestError = useMemo(() => jobs.find((job) => job.error)?.error ?? null, [jobs]);
  const activeJob = useMemo(() => jobs.find((job) => job.status === "running" || job.status === "processing") ?? jobs[0], [jobs]);
  const dagNodes = project?.dag?.nodes ?? [];
  const dagEdges = project?.dag?.edges ?? [];
  const nodeById = useMemo(() => new Map(dagNodes.map((node) => [node.id, node])), [dagNodes]);
  const selectNode = (nodeId: string | null) => {
    setInternalSelectedNode(nodeId);
    onNodeSelect?.(nodeId);
    const node = nodeId ? nodeById.get(nodeId) : undefined;
    setInspectorShotId(node?.shotId ?? null);
  };
  const selectedNodeError = nodeDetails && typeof nodeDetails.node.error === "string" ? nodeDetails.node.error : null;
  const blockedPath = useMemo(() => {
    const blockedNodes = new Set(dagNodes.filter((node) => node.status === "failed" || node.status === "blocked").map((node) => node.id));
    const downstreamNodes = new Set(blockedNodes);
    const downstreamEdges = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of dagEdges) {
        if (downstreamNodes.has(edge.source) || downstreamNodes.has(edge.target)) {
          if (!downstreamEdges.has(edge.id)) { downstreamEdges.add(edge.id); changed = true; }
        }
        if (downstreamNodes.has(edge.source) && !downstreamNodes.has(edge.target)) {
          downstreamNodes.add(edge.target);
          changed = true;
        }
      }
    }
    return { nodes: downstreamNodes, edges: downstreamEdges };
  }, [dagNodes, dagEdges]);

  if (!project) return null;

  return (
    <section className="genei-card overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-pink-500/5">
      <div className="border-b border-border/70 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><h2 className="font-display text-base font-semibold text-foreground">{t(locale, "orchestrationGraph")}</h2><span className="genei-badge-purple">{project.project.status}</span></div>
              <p className="text-xs text-muted-foreground">{t(locale, "liveTelemetry")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/10 px-2 py-1 text-[10px] text-muted-foreground"><Globe className="h-3 w-3 text-primary" /><select aria-label="Select language locale" value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="bg-transparent text-foreground outline-none"><option value="en">EN</option><option value="es">ES</option><option value="fr">FR</option><option value="ja">JA</option></select></div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Activity className="h-3 w-3 text-emerald-300" /> Live</span><span>{isFetching ? "syncing" : "refreshed just now"}</span></div>
            </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Graph progress", value: `${averageProgress}%`, icon: GitBranch },
            { label: "Running", value: runningJobs, icon: Loader2 },
            { label: "Completed", value: completedJobs, icon: CheckCircle2 },
            { label: "QC score", value: qcScore === null ? "—" : qcScore, icon: ServerCog },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl border border-border/60 bg-secondary/10 px-3 py-2"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><metric.icon className="h-3 w-3 text-primary" />{metric.label}</div><div className="mt-1 text-lg font-semibold text-foreground">{metric.value}</div></div>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5 text-primary" />Current stage: <span className="font-medium text-foreground">{activeJob?.stage ?? "waiting for compilation"}</span>{activeJob && <span>· {activeJob.progress}%</span>}</div>
          <div className="flex items-center gap-1.5">
            {onPause && <button type="button" onClick={onPause} className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label="Pause orchestration"><Pause className="h-3.5 w-3.5" /></button>}
            {onResume && <button type="button" onClick={onResume} className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label="Resume orchestration"><Play className="h-3.5 w-3.5" /></button>}
            {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-amber-500/30 p-2 text-amber-200 hover:bg-amber-500/10" aria-label="Cancel orchestration"><X className="h-3.5 w-3.5" /></button>}
            {onStop && <button type="button" onClick={onStop} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" aria-label="Stop orchestration"><Square className="h-3.5 w-3.5" /></button>}
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {stageLabels.map((stage, index) => {
            const result = progressForStage(jobs, stage.id);
            return <div key={stage.id} className="flex min-w-[94px] flex-1 items-center gap-1"><div className={`min-w-0 flex-1 rounded-lg border px-2 py-2 ${statusTone(result.status)}`}><div className="flex items-center gap-1 text-[10px] font-medium">{statusIcon(result.status)}<span className="truncate">{stage.label}</span></div><div className="mt-1 h-1 rounded-full bg-black/20"><div className="h-full rounded-full bg-current transition-all" style={{ width: `${result.progress}%` }} /></div></div>{index < stageLabels.length - 1 && <span className="text-border">›</span>}</div>;
          })}
        </div>

        <div className="rounded-xl border border-border/70 bg-black/10 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-foreground"><GitBranch className="h-3.5 w-3.5 text-primary" />Dependency topology</div><span className="text-[10px] text-muted-foreground">{dagNodes.length} nodes · {dagEdges.length} directed edges</span></div>
          {blockedPath.nodes.size > 0 && <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[10px] text-red-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><span className="font-semibold">Blocked path:</span> {blockedPath.nodes.size} node{blockedPath.nodes.size === 1 ? "" : "s"} are blocked or downstream from a failed node. Repair the earliest red node before continuing.</div></div>}
          {dagEdges.length === 0 ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">The Director is compiling node dependencies.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{dagEdges.map((edge) => { const source = nodeById.get(edge.source); const target = nodeById.get(edge.target); const isBlockedPath = blockedPath.edges.has(edge.id); return <div key={edge.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${isBlockedPath ? "border-red-500/50 bg-red-500/10" : "border-border/60 bg-secondary/10"}`}><button type="button" onClick={() => selectNode(edge.source)} className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-left text-[10px] transition-colors hover:border-primary/60 ${blockedPath.nodes.has(edge.source) ? "border-red-500/50 bg-red-500/10 text-red-200" : statusTone(source?.status ?? "queued")}`}><div className="truncate font-medium">{source?.label ?? edge.source}</div><div className="text-[9px] opacity-70">{source?.kind ?? "node"}</div></button><div className="flex shrink-0 flex-col items-center text-border"><span className={`text-[9px] ${isBlockedPath ? "text-red-300" : "text-primary"}`}>{isBlockedPath ? "blocked" : edge.kind}</span><span className="text-base leading-none">→</span></div><button type="button" onClick={() => selectNode(edge.target)} className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-left text-[10px] transition-colors hover:border-primary/60 ${blockedPath.nodes.has(edge.target) ? "border-red-500/50 bg-red-500/10 text-red-200" : statusTone(target?.status ?? "queued")}`}><div className="truncate font-medium">{target?.label ?? edge.target}</div><div className="text-[9px] opacity-70">{target?.kind ?? "node"}</div></button></div>; })}</div>}
        </div>

        {selectedNode && <aside aria-label="DAG node inspection" className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-[0_0_24px_oklch(0.6_0.25_310_/_0.08)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ServerCog className="h-4 w-4 text-primary" />Node inspection</div><p className="mt-1 text-[10px] text-muted-foreground">Live status, execution logs, and generated assets for <span className="font-medium text-foreground">{nodeDetails?.node.label ?? selectedNode}</span>.</p></div><button type="button" onClick={() => selectNode(null)} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">Close</button></div>{nodeDetailsLoading && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />Refreshing node telemetry…</div>}{!nodeDetailsLoading && !nodeDetails && <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Node details are not available yet. Select a persisted node or refresh the orchestration graph.</div>}{nodeDetails && <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg border border-border/60 bg-background/20 p-2"><div className="text-[9px] text-muted-foreground">Kind</div><div className="mt-1 text-xs font-semibold text-foreground">{nodeDetails.node.kind}</div></div><div className={`rounded-lg border p-2 ${statusTone(nodeDetails.node.status)}`}><div className="text-[9px] opacity-70">Status</div><div className="mt-1 flex items-center gap-1 text-xs font-semibold">{statusIcon(nodeDetails.node.status)}{nodeDetails.node.status}</div></div><div className="rounded-lg border border-border/60 bg-background/20 p-2"><div className="text-[9px] text-muted-foreground">Progress</div><div className="mt-1 text-xs font-semibold text-foreground">{nodeDetails.node.progress}%</div></div><div className="rounded-lg border border-border/60 bg-background/20 p-2"><div className="text-[9px] text-muted-foreground">Jobs</div><div className="mt-1 text-xs font-semibold text-foreground">{nodeDetails.jobs.length}</div></div></div><div className="mt-3 rounded-lg border border-border/60 bg-background/20 p-3"><div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-foreground"><span>Execution sequence & duration timeline</span><span className="text-muted-foreground">{nodeDetails.jobs.length} jobs</span></div>{nodeDetails.jobs.length === 0 ? <div className="text-[10px] text-muted-foreground">No execution jobs recorded for this node yet.</div> : <div className="space-y-2">{nodeDetails.jobs.map((job, idx) => { const durationSec = Math.max(1, Math.round((Date.now() - new Date(job.updatedAt).getTime()) / 1000)); return <div key={job.id} className="flex items-center gap-3 rounded-md border border-border/50 bg-secondary/10 px-3 py-2"><span className="text-[10px] font-mono text-muted-foreground">#{idx + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-foreground">{job.stage} · {job.status}</span><span className="text-[9px] text-muted-foreground">{durationSec}s elapsed</span></div><div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/60"><div className="h-full rounded-full bg-primary" style={{ width: `${job.progress}%` }} /></div><span className="text-[9px] text-foreground">{job.progress}%</span></div></div></div>; })}</div>}</div>{selectedNodeError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{selectedNodeError}</span></div>}<div className="mt-3 grid gap-3 lg:grid-cols-2"><div className="rounded-lg border border-border/60 bg-background/20 p-3"><div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-foreground"><span>Execution logs</span><span className="text-muted-foreground">{nodeDetails.logs.length}</span></div>{nodeDetails.logs.length === 0 ? <div className="text-[10px] text-muted-foreground">No persisted logs for this node yet.</div> : <div className="max-h-48 space-y-2 overflow-auto">{nodeDetails.logs.map((log) => <div key={log.id} className="rounded-md border border-border/50 bg-secondary/10 p-2"><div className="flex items-center justify-between gap-2"><span className={`text-[9px] font-semibold uppercase ${log.level === "error" ? "text-red-300" : log.level === "warning" ? "text-amber-200" : "text-primary"}`}>{log.level}</span><span className="text-[9px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span></div><div className="mt-1 text-[10px] text-foreground/90">{log.message}</div></div>)}</div>}</div><div className="rounded-lg border border-border/60 bg-background/20 p-3"><div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-foreground"><span>Generated assets</span><span className="text-muted-foreground">{nodeDetails.assets.length}</span></div>{nodeDetails.assets.length === 0 ? <div className="text-[10px] text-muted-foreground">No generated assets have been attached to this node yet.</div> : <div className="space-y-2">{nodeDetails.assets.map((asset) => <a key={asset.id} href={asset.storageUrl} target="_blank" rel="noreferrer" className="block rounded-md border border-border/50 bg-secondary/10 p-2 transition-colors hover:border-primary/50"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-foreground">{asset.kind}</span><span className="text-[9px] text-primary">Open asset</span></div><div className="mt-1 truncate text-[9px] text-muted-foreground">{asset.source} · {asset.mimeType ?? "media"}{asset.sizeBytes ? ` · ${Math.round(asset.sizeBytes / 1024)} KB` : ""}</div></a>)}</div>}</div></div></>}</aside>}

        <div className="grid gap-3 md:grid-cols-2">
          {scenes.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground md:col-span-2">The Director is compiling its first scene graph.</div> : scenes.map((scene) => {
            const sceneShots = shots.filter((shot) => shot.sceneId === scene.id).sort((a, b) => a.sequenceIndex - b.sequenceIndex);
            const sceneJobs = jobs.filter((job) => job.sceneId === scene.id);
            const sceneProgress = sceneJobs.length ? Math.round(sceneJobs.reduce((sum, job) => sum + job.progress, 0) / sceneJobs.length) : sceneShots.length ? Math.round(sceneShots.reduce((sum, shot) => sum + (shot.status === "generated" || shot.status === "approved" ? 100 : shot.status === "generating" ? 50 : 0), 0) / sceneShots.length) : 0;
            return <div key={scene.id} className="rounded-xl border border-border/70 bg-secondary/10 p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><GitBranch className="h-3.5 w-3.5 text-primary" />{scene.sceneKey} · {scene.title}</div><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{scene.objective}</p></div><span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${statusTone(scene.status)}`}>{statusIcon(scene.status)}{scene.status}</span></div><div className="mt-3 flex items-center gap-1.5"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/60"><div className="h-full rounded-full bg-gradient-to-r from-primary to-pink-500" style={{ width: `${sceneProgress}%` }} /></div><span className="text-[10px] text-muted-foreground">{sceneProgress}%</span></div><div className="mt-3 space-y-2">{sceneShots.map((shot, index) => { const shotJob = jobs.find((job) => job.shotId === shot.id); const nodeKey = `shot-${shot.id}`; return <div key={shot.id} className={`rounded-lg border px-2.5 py-2 transition-colors ${selectedNode === nodeKey ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background/20"}`}><div className="flex items-center gap-2"><button type="button" onClick={() => { selectNode(selectedNode === nodeKey ? null : nodeKey); }} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className="text-[10px] text-muted-foreground">{index + 1}</span><span className="truncate text-[11px] font-medium text-foreground">{shot.shotKey}</span><span className={`ml-auto flex items-center gap-1 text-[10px] ${statusTone(shot.status)}`}>{statusIcon(shot.status)}{shot.status}</span></button>{onRetry && <button type="button" onClick={() => onRetry(shot.id)} className="rounded-md border border-border p-1 text-muted-foreground hover:border-primary/50 hover:text-primary" aria-label={`Retry ${shot.shotKey}`}><RotateCcw className="h-3 w-3" /></button>}</div>{shotJob && <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground"><div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary/60"><div className="h-full rounded-full bg-primary" style={{ width: `${shotJob.progress}%` }} /></div><span>{shotJob.stage} · {shotJob.progress}%</span></div>}{selectedNode === nodeKey && <div className="mt-2 grid gap-1 border-t border-border/60 pt-2 text-[10px] text-muted-foreground sm:grid-cols-2"><span>Route: {shot.routeUsed ?? "awaiting route"}</span><span>QA: {shot.qaScore ?? "pending"}</span><span>Start boundary: {shot.startContinuity ? "captured" : "unknown"}</span><span>End boundary: {shot.endContinuity ? "captured" : "unknown"}</span><span className="sm:col-span-2 text-primary">Select this shot to open the continuity inspector.</span></div>}</div>; })}</div></div>;
          })}
        </div>

        {inspectorShot && continuityDraft && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-[0_0_24px_oklch(0.6_0.25_310_/_0.08)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Workflow className="h-4 w-4 text-primary" />Continuity Inspector · {inspectorShot.shotKey}</div><p className="mt-1 text-[10px] text-muted-foreground">Compare the previous end state with this shot’s start state. Unknown fields stay explicit until an analyzer or operator supplies evidence.</p></div><button type="button" onClick={() => { setInspectorShotId(null); selectNode(null); }} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">Close</button></div><div className="mt-3 grid gap-2 md:grid-cols-2">{continuityFieldLabels.map(([key, label]) => { const item = continuityDraft[key]; const mismatch = item.start !== item.end && item.start !== "unknown" && item.end !== "unknown"; return <div key={key} className={`rounded-lg border p-3 ${mismatch ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-background/20"}`}><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-foreground">{label}</span><span className={`text-[9px] ${mismatch ? "text-amber-200" : "text-muted-foreground"}`}>{mismatch ? "mismatch" : "aligned / unknown"}</span></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-[9px] text-muted-foreground">Start<input aria-label={`${label} start`} value={item.start} disabled={item.locked} onChange={(event) => setContinuityDraft((current) => current ? { ...current, [key]: { ...current[key], start: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-[10px] text-foreground disabled:opacity-60" /></label><label className="text-[9px] text-muted-foreground">End<input aria-label={`${label} end`} value={item.end} disabled={item.locked} onChange={(event) => setContinuityDraft((current) => current ? { ...current, [key]: { ...current[key], end: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-[10px] text-foreground disabled:opacity-60" /></label></div><label className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground"><input type="checkbox" checked={item.locked} onChange={(event) => setContinuityDraft((current) => current ? { ...current, [key]: { ...current[key], locked: event.target.checked } } : current)} /> Lock handoff field</label></div>; })}</div><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={!onSaveBoundary} onClick={() => onSaveBoundary?.(inspectorShot.id, { startContinuity: boundaryFromDraft(continuityDraft, "start"), endContinuity: boundaryFromDraft(continuityDraft, "end"), status: "needs_review" })} className="rounded-lg border border-primary/40 px-3 py-1.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">Save boundary review</button><button type="button" disabled={!onSaveBoundary} onClick={() => onSaveBoundary?.(inspectorShot.id, { startContinuity: boundaryFromDraft(continuityDraft, "start"), endContinuity: boundaryFromDraft(continuityDraft, "end"), status: "approved" })} className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Approve handoff</button></div></div>}

        {latestError && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">Orchestration error</div><div className="mt-0.5 text-red-200/80">{latestError}</div></div></div>}
        {blockedJobs > 0 && <div className="text-[10px] text-amber-200">{blockedJobs} node{blockedJobs === 1 ? "" : "s"} require review or repair before downstream compilation continues.</div>}
      </div>
    </section>
  );
}

export type { DirectorData };
