import { useState } from "react";
import React from "react";
import { motion } from "framer-motion";
import { Zap, Plus, Play, Pause, ChevronRight, ArrowRight, Clock, Globe, Music, Image, Video, Bot, Mail, Share2, Database, Webhook } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// `triggerId` / `actionIds` reference real entries in triggerTypes / actionTypes,
// so selecting a template can genuinely populate the builder state instead of
// only claiming to load it.
const workflowTemplates = [
  { name: "Daily Content Pipeline", desc: "Auto-generate & post social content daily", triggers: ["Schedule"], actions: ["AI Image", "Caption", "Post"], triggerId: "schedule", actionIds: ["image", "ai", "post"], color: "oklch(0.65 0.22 285)" },
  { name: "Music Release Automation", desc: "Create song → generate cover → publish", triggers: ["Manual"], actions: ["Music", "Image", "Distribute"], triggerId: "manual", actionIds: ["music", "image", "publish"], color: "oklch(0.60 0.25 310)" },
  { name: "Video Repurposing", desc: "Long video → shorts → thumbnails → post", triggers: ["Upload"], actions: ["Video", "Thumbnail", "Share"], triggerId: "upload", actionIds: ["video", "image", "post"], color: "oklch(0.72 0.18 210)" },
  { name: "Brand Kit Generator", desc: "Company name → full brand identity", triggers: ["Prompt"], actions: ["Logo", "Colors", "Fonts", "Export"], triggerId: "manual", actionIds: ["image", "ai", "publish"], color: "oklch(0.78 0.18 75)" },
];

const triggerTypes = [
  { id: "schedule", label: "Schedule", icon: Clock, desc: "Time-based trigger" },
  { id: "webhook", label: "Webhook", icon: Webhook, desc: "HTTP trigger" },
  { id: "upload", label: "File Upload", icon: Database, desc: "On file upload" },
  { id: "manual", label: "Manual", icon: Play, desc: "Run on demand" },
];

const actionTypes = [
  { id: "music", label: "Generate Music", icon: Music, color: "oklch(0.65 0.22 285)" },
  { id: "image", label: "Generate Image", icon: Image, color: "oklch(0.72 0.18 210)" },
  { id: "video", label: "Generate Video", icon: Video, color: "oklch(0.60 0.25 310)" },
  { id: "post", label: "Post to Social", icon: Share2, color: "oklch(0.68 0.20 155)" },
  { id: "email", label: "Send Email", icon: Mail, color: "oklch(0.78 0.18 75)" },
  { id: "ai", label: "AI Processing", icon: Bot, color: "oklch(0.65 0.22 285)" },
  { id: "webhook", label: "Call Webhook", icon: Webhook, color: "oklch(0.72 0.18 210)" },
  { id: "publish", label: "Publish Asset", icon: Globe, color: "oklch(0.60 0.25 310)" },
];

export default function AutomationCenter() {
  const [selectedTrigger, setSelectedTrigger] = useState("schedule");
  const [selectedActions, setSelectedActions] = useState<string[]>(["image", "post"]);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);

  // The builder writes real workflows now. They are stored as nodes and edges, and
  // queued as durable jobs, rather than described as a preview.
  const workflowsQuery = trpc.workflows.list.useQuery();
  const projectsQuery = trpc.projects.list.useQuery();
  const saveWorkflow = trpc.workflows.save.useMutation({
    onSuccess: (result) => {
      toast.message(result.status === "created" ? "Workflow saved" : "Workflow updated", { description: `Workflow ${result.id}.` });
      setTitle("");
      void workflowsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const runWorkflow = trpc.workflows.execute.useMutation({
    onSuccess: (result) => {
      // The server reports exactly what happened, including when it could not queue.
      if (result.success) toast.message("Queued", { description: result.message });
      else toast.error(result.message);
    },
    onError: (error) => toast.error(error.message),
  });

  const buildGraph = () => {
    const nodes = [
      { id: `trigger:${selectedTrigger}`, kind: "trigger", value: selectedTrigger },
      ...selectedActions.map((action) => ({ id: `action:${action}`, kind: "action", value: action })),
    ];
    const edges = selectedActions.map((action) => ({ from: `trigger:${selectedTrigger}`, to: `action:${action}` }));
    return { nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) };
  };

  const toggleAction = (id: string) => {
    setSelectedActions(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.60 0.25 310), oklch(0.78 0.18 75))", boxShadow: "0 0 20px oklch(0.60 0.25 310 / 0.4)" }}>
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text">Automation Center</h1>
          <p className="text-xs text-muted-foreground">AI-powered workflow automation</p>
          <span className="mt-2 inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">Workflows save to your account and queue as durable jobs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Workflow Builder */}
          <div className="genei-card p-5 rounded-xl space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="font-semibold text-foreground font-display">Build Workflow</h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="genei-input min-w-[10rem] flex-1 text-xs"
                    placeholder="Workflow name"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <select
                    className="genei-input text-xs"
                    value={projectId ?? ""}
                    onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">No project</option>
                    {(projectsQuery.data ?? []).map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                className="genei-btn-primary flex items-center gap-2 text-xs py-2 px-3"
                disabled={saveWorkflow.isPending || !title.trim() || selectedActions.length === 0}
                onClick={() => {
                  const graph = buildGraph();
                  saveWorkflow.mutate({
                    title: title.trim(),
                    description: `${selectedTrigger} trigger → ${selectedActions.join(", ")}`,
                    projectId: projectId ?? undefined,
                    nodes: graph.nodes,
                    edges: graph.edges,
                  });
                }}
              >
                <Plus className="w-3.5 h-3.5" /> {saveWorkflow.isPending ? "Saving…" : "Save Workflow"}
              </button>
            </div>

            {/* Trigger */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">Trigger</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {triggerTypes.map((trigger) => (
                  <button key={trigger.id} onClick={() => setSelectedTrigger(trigger.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${selectedTrigger === trigger.id ? "border-primary/50 bg-primary/10" : "border-border hover:border-border/80"}`}
                    style={{ background: selectedTrigger === trigger.id ? "oklch(0.65 0.22 285 / 0.12)" : "oklch(0.13 0.015 265)" }}>
                    <trigger.icon className={`w-5 h-5 ${selectedTrigger === trigger.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className={`text-xs font-medium ${selectedTrigger === trigger.id ? "text-foreground" : "text-muted-foreground"}`}>{trigger.label}</div>
                      <div className="text-[10px] text-muted-foreground">{trigger.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-px h-4" style={{ background: "oklch(0.65 0.22 285 / 0.5)" }} />
                <ArrowRight className="w-5 h-5 text-primary rotate-90" />
                <div className="w-px h-4" style={{ background: "oklch(0.65 0.22 285 / 0.5)" }} />
              </div>
            </div>

            {/* Actions */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">Actions (select multiple)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {actionTypes.map((action) => (
                  <button key={action.id} onClick={() => toggleAction(action.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${selectedActions.includes(action.id) ? "border-primary/50" : "border-border hover:border-border/80"}`}
                    style={{ background: selectedActions.includes(action.id) ? `${action.color} / 0.12` : "oklch(0.13 0.015 265)" }}>
                    <action.icon className={`w-4 h-4 flex-shrink-0 ${selectedActions.includes(action.id) ? "" : "text-muted-foreground"}`}
                      style={selectedActions.includes(action.id) ? { color: action.color } : {}} />
                    <span className={`text-xs font-medium ${selectedActions.includes(action.id) ? "text-foreground" : "text-muted-foreground"}`}>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm"
              disabled={saveWorkflow.isPending || !title.trim() || selectedActions.length === 0}
              onClick={async () => {
                // Save, then queue what was saved. A project is required to queue,
                // because a job is project-scoped.
                const graph = buildGraph();
                const saved = await saveWorkflow.mutateAsync({
                  title: title.trim(),
                  description: `${selectedTrigger} trigger → ${selectedActions.join(", ")}`,
                  projectId: projectId ?? undefined,
                  nodes: graph.nodes,
                  edges: graph.edges,
                }).catch(() => null);
                if (!saved) return;
                runWorkflow.mutate({ workflowId: saved.id });
              }}
            >
              <Play className="w-4 h-4" /> Create &amp; Queue Workflow
            </button>
          </div>

          {/* Saved Workflows */}
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground font-display">Saved Workflows</h3>
              <span className="genei-badge-purple text-xs">{(workflowsQuery.data ?? []).length}</span>
            </div>
            {(workflowsQuery.data ?? []).length === 0 ? (
              <div className="p-6 text-center">
                <Zap className="mx-auto h-7 w-7 text-primary/70" />
                <p className="mt-2 text-sm font-medium text-foreground">No workflows saved yet</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Name a workflow above and save it. It is stored on your account and can be queued as a durable job.
                </p>
              </div>
            ) : (
              <div>
                {(workflowsQuery.data ?? []).map((workflow, index) => (
                  <div
                    key={workflow.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${index < (workflowsQuery.data ?? []).length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground">{workflow.title}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{workflow.description ?? "No description"}</div>
                    </div>
                    <button
                      type="button"
                      className="gx-seg-btn flex-shrink-0"
                      disabled={runWorkflow.isPending}
                      onClick={() => runWorkflow.mutate({ workflowId: workflow.id })}
                    >
                      <Play className="w-3 h-3" /> Queue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Templates */}
        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground font-display">Workflow Templates</h3>
            {workflowTemplates.map((tmpl) => (
              <div key={tmpl.name} className="p-4 rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-all group"
                style={{ background: "oklch(0.13 0.015 265)" }}
                onClick={() => {
                  setSelectedTrigger(tmpl.triggerId);
                  setSelectedActions(tmpl.actionIds);
                  toast.success(`Applied the ${tmpl.name} template`, { description: "The trigger and actions above are filled in. Saving and running stay in preview until the automation backend is connected." });
                }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm font-semibold text-foreground">{tmpl.name}</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground mb-3">{tmpl.desc}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {[...tmpl.triggers, "→", ...tmpl.actions].map((item, i) => (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${item === "→" ? "text-muted-foreground" : "border border-border text-muted-foreground"}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
