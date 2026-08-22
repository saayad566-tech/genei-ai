import React, { useState } from "react";
import { motion } from "framer-motion";
import { Workflow, Play, Plus, Save, Trash2, Cpu, Sparkles, Layers, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface WorkflowNode {
  id: string;
  title: string;
  type: "prompt" | "model" | "sampler" | "vae" | "upscale" | "output";
  config: Record<string, string>;
}

export default function ComfyWorkflowStudio() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [workflowTitle, setWorkflowTitle] = useState("Cinematic Shot Pipeline");
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: "node-1", title: "Prompt & Subject Input", type: "prompt", config: { prompt: "Cinematic portrait, dramatic lighting, 8k" } },
    { id: "node-2", title: "Model Loader (SDXL / Flux)", type: "model", config: { model: "flux-schnell.safetensors", precision: "fp16" } },
    { id: "node-3", title: "K-Sampler / Inference", type: "sampler", config: { steps: "25", cfg: "7.0", sampler: "euler" } },
    { id: "node-4", title: "Latent Upscale (ESRGAN)", type: "upscale", config: { scale: "2x", model: "RealESRGAN_x4plus" } },
    { id: "node-5", title: "Final Render Output", type: "output", config: { format: "PNG / ProRes", target: "Local S3 / Asset Library" } },
  ]);

  const { data: workflows, refetch: refetchWorkflows } = trpc.workflows.list.useQuery();
  const saveMutation = trpc.workflows.save.useMutation({
    onSuccess: (res) => {
      refetchWorkflows();
      if (res.id) setSelectedWorkflowId(res.id);
      toast.success("ComfyUI workflow saved successfully!");
    },
    onError: (err) => toast.error(err.message || "Failed to save workflow"),
  });

  const executeMutation = trpc.workflows.execute.useMutation({
    onSuccess: (res) => toast.success(res.message),
    onError: (err) => toast.error(err.message || "Execution failed"),
  });

  const addNode = (type: WorkflowNode["type"]) => {
    const id = `node-${Date.now()}`;
    const titles: Record<WorkflowNode["type"], string> = {
      prompt: "Custom Prompt Node",
      model: "Model Loader Node",
      sampler: "Sampler & Scheduler",
      vae: "VAE Decode / Encode",
      upscale: "Upscale & Refine",
      output: "Export & Storage Sink",
    };
    setNodes([...nodes, { id, title: titles[type], type, config: { status: "ready" } }]);
    toast.success(`Added ${titles[type]} to canvas`);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    toast.success("Node removed from workflow");
  };

  return (
    <div className="p-5 max-w-[1400px] mx-auto space-y-7">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="genei-card p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">VISUAL NODE PIPELINE</span>
              <span className="text-xs text-muted-foreground">ComfyUI-Style Generative Graph Studio</span>
            </div>
            <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">ComfyUI & Node Graph Studio</h1>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Construct modular AI generation pipelines by connecting prompt, model loader, sampler, upscaler, and output nodes together. Execute locally on your BYOH workstation or via cloud providers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={workflowTitle}
              onChange={(e) => setWorkflowTitle(e.target.value)}
              className="genei-input text-xs w-60"
              placeholder="Workflow title..."
            />
            <button
              type="button"
              onClick={() => saveMutation.mutate({ id: selectedWorkflowId ?? undefined, title: workflowTitle, nodes: JSON.stringify(nodes), edges: JSON.stringify([]) })}
              className="genei-btn-secondary px-4 py-2 text-xs flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" /> Save Graph
            </button>
            <button
              type="button"
              disabled={!selectedWorkflowId && !workflows?.[0]}
              onClick={() => executeMutation.mutate({ workflowId: selectedWorkflowId ?? workflows?.[0]?.id ?? 0 })}
              className="genei-button-primary px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Execute Graph
            </button>
          </div>
        </div>
      </motion.div>

      {/* Node Palette */}
      <div className="genei-card p-4 rounded-xl flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground mr-2">Add Node:</span>
        <button type="button" onClick={() => addNode("prompt")} className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-cyan-400" /> Prompt Input
        </button>
        <button type="button" onClick={() => addNode("model")} className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-purple-400" /> Model Loader
        </button>
        <button type="button" onClick={() => addNode("sampler")} className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-pink-400" /> K-Sampler
        </button>
        <button type="button" onClick={() => addNode("upscale")} className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-amber-400" /> Upscaler
        </button>
        <button type="button" onClick={() => addNode("output")} className="genei-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3 text-green-400" /> Output Sink
        </button>
      </div>

      {/* Visual Canvas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {nodes.map((node, index) => (
          <motion.div key={node.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="genei-card p-5 rounded-2xl space-y-4 border border-border/80 relative group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold font-mono">
                  {index + 1}
                </span>
                <h3 className="text-xs font-semibold text-foreground font-display">{node.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => removeNode(node.id)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                aria-label="Remove node"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 rounded-xl border border-border bg-black/40 space-y-2 font-mono text-[11px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{node.type} node parameters</div>
              {Object.entries(node.config).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{k}:</span>
                  <span className="text-foreground font-semibold">{v}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
              <span>Status: <strong className="text-green-400">Ready</strong></span>
              <span>ID: {node.id}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
