import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Video, Play, Pause, Film, Clapperboard, Subtitles,
  Wand2, Zap, Clock, Download, Share2, Plus, Layers,
  AlignLeft, Mic, ChevronRight, Loader2, LayoutGrid
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DagOrchestrationDashboard from "@/components/DagOrchestrationDashboard";

const videoTypes = [
  { id: "cinematic", label: "Cinematic", icon: Film, color: "oklch(0.65 0.22 285)" },
  { id: "music-video", label: "Music Video", icon: Play, color: "oklch(0.60 0.25 310)" },
  { id: "anime", label: "Anime", icon: Layers, color: "oklch(0.72 0.18 210)" },
  { id: "shorts", label: "Shorts/Reels", icon: Video, color: "oklch(0.78 0.18 75)" },
];

const integrations = [
  { name: "Runway", desc: "Gen-3 video AI", color: "oklch(0.65 0.22 285)" },
  { name: "Pika", desc: "Text-to-video", color: "oklch(0.60 0.25 310)" },
  { name: "Kling", desc: "Cinematic AI", color: "oklch(0.72 0.18 210)" },
  { name: "HeyGen", desc: "AI avatars & lip sync", color: "oklch(0.78 0.18 75)" },
];

const storyboardFrames = [
  { id: 1, label: "Opening Shot", desc: "Wide aerial view of neon city" },
  { id: 2, label: "Character Intro", desc: "Close-up of protagonist" },
  { id: 3, label: "Rising Action", desc: "Chase through dark alley" },
  { id: 4, label: "Climax", desc: "Rooftop confrontation" },
  { id: 5, label: "Resolution", desc: "Sunrise over city skyline" },
  { id: 6, label: "Outro", desc: "Logo reveal with glow effect" },
];

export default function VideoStudio() {
  const [prompt, setPrompt] = useState("");
  const [videoType, setVideoType] = useState("cinematic");
  const [activeTab, setActiveTab] = useState<"create" | "timeline" | "storyboard">("create");
  const [lipSync, setLipSync] = useState(false);
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(15);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [resolution, setResolution] = useState("1080p");
  const [format, setFormat] = useState("MP4");
  const [fps, setFps] = useState("24");
  const [publishTarget, setPublishTarget] = useState("download");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<"en" | "es" | "fr" | "ja">("en");
  const [, navigate] = useLocation();

  const translateMutation = trpc.globalSettings.translateText.useMutation();
  const createDirectorProject = trpc.director.createProject.useMutation();
  const retryShot = trpc.director.retryShot.useMutation({
    onSuccess: () => toast.success("Shot queued for targeted regeneration"),
    onError: (error) => toast.error(error.message),
  });
  const createExport = trpc.exports.create.useMutation({
    onSuccess: () => toast.success("Export queued for the configured cloud or BYOH worker"),
    onError: (error) => toast.error(error.message),
  });
  const directorQuery = trpc.director.getProject.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null, refetchInterval: projectId !== null ? 3000 : false },
  );
  const nodeDetailsQuery = trpc.director.nodeDetails.useQuery(
    { projectId: projectId ?? 0, nodeId: selectedNodeId ?? "" },
    { enabled: projectId !== null && selectedNodeId !== null, refetchInterval: selectedNodeId ? 3000 : false },
  );
  const saveBoundary = trpc.director.saveBoundary.useMutation({
    onSuccess: () => { toast.success("Continuity boundary saved"); void directorQuery.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const controlProject = trpc.director.controlProject.useMutation({
    onSuccess: (_, variables) => { const label = variables.action === "pause" ? "paused" : variables.action === "resume" ? "resumed" : variables.action === "cancel" ? "cancelled" : "stopped"; toast.success(`Orchestration ${label}`); void directorQuery.refetch(); },
    onError: (error) => toast.error(error.message),
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Enter a video description first"); return; }
    setIsGenerating(true);
    try {
      let finalBrief = prompt.trim();
      if (enableTranslation && targetLanguage !== "en") {
        toast.info("Translating prompt brief...", { description: `Converting description into ${targetLanguage.toUpperCase()}` });
        const trRes = await translateMutation.mutateAsync({ text: finalBrief, targetLanguage });
        finalBrief = typeof trRes.translated === "string" ? trRes.translated : finalBrief;
      }

      const result = await createDirectorProject.mutateAsync({
        projectId: projectId ?? undefined,
        title: `${videoType} production`,
        brief: finalBrief,
        aspectRatio,
        resolution,
        fps: Number(fps),
      });
      setProjectId(result.projectId);
      setActiveTab("timeline");
      toast.success("AI Director project queued", { description: "Scene contracts and continuity handoffs are ready." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the AI Director pipeline");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.60 0.25 310), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.60 0.25 310 / 0.4)" }}>
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display genei-gradient-text">Video Studio</h1>
            <p className="text-xs text-muted-foreground">AI cinematic video creation</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate("/director")} className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"><LayoutGrid className="h-3.5 w-3.5" /> Director Console</button>
          <span className="genei-badge-pink">Cinematic AI</span>
          <span className="genei-badge-purple">Auto Subtitles</span>
        </div>
      </div>

      {/* Video Type Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {videoTypes.map((type) => (
          <motion.button
            key={type.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => setVideoType(type.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 ${
              videoType === type.id ? "border-primary/50" : "border-border hover:border-border/80"
            }`}
            style={videoType === type.id ? {
              background: `${type.color} / 0.12`,
              boxShadow: `0 0 20px ${type.color} / 0.2`
            } : { background: "oklch(0.12 0.015 265)" }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: `${type.color} / 0.2` }}>
              <type.icon className="w-4 h-4" style={{ color: type.color }} />
            </div>
            <span className={`text-sm font-medium ${videoType === type.id ? "text-foreground" : "text-muted-foreground"}`}>
              {type.label}
            </span>
          </motion.button>
        ))}
      </div>

      {projectId !== null && <DagOrchestrationDashboard
        project={directorQuery.data}
        isFetching={directorQuery.isFetching}
        onRetry={(shotId) => retryShot.mutate({ projectId, shotId, reason: "DAG dashboard requested targeted shot retry." })}
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Panel */}
        <div className="xl:col-span-2 space-y-5">
          {projectId !== null && (
            <div className="genei-card p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">AI Director Pipeline</div>
                  <div className="text-[10px] text-muted-foreground">Scene contracts, continuity handoffs, QC, and targeted repair status</div>
                </div>
                <span className="genei-badge-purple">{directorQuery.data?.project.status ?? "processing"}</span>
              </div>
              {(directorQuery.data?.jobs ?? []).slice(0, 3).map((job) => (
                <div key={job.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{job.stage} · {job.kind}</span><span>{job.progress}%</span></div>
                  <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job.progress}%` }} /></div>
                  {job.error && <div className="text-[10px] text-destructive">{job.error}</div>}
                </div>
              ))}
              {(directorQuery.data?.shots ?? []).map((shot) => (
                <div key={shot.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/10 px-3 py-2">
                  <div className="min-w-0"><div className="text-xs font-medium text-foreground">{shot.shotKey}</div><div className="truncate text-[10px] text-muted-foreground">{shot.status} · {shot.routeUsed ?? "awaiting route"}</div></div>
                  <button type="button" onClick={() => projectId !== null && retryShot.mutate({ projectId, shotId: shot.id, reason: "User requested targeted regeneration after reviewing continuity or artifact warnings." })} className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary">Retry shot</button>
                </div>
              ))}
              {(directorQuery.data?.qc ?? []).slice(0, 3).map((report) => (
                <div key={report.id} className={`rounded-lg border p-2 text-[10px] ${report.passed ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/20 bg-amber-500/5 text-amber-200"}`}>
                  {report.subjectKey}: {report.passed ? "passed" : "review required"} · score {report.score}
                </div>
              ))}
            </div>
          )}
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "oklch(0.12 0.015 265)", border: "1px solid oklch(0.20 0.02 265)" }}>
            {[
              { id: "create", label: "Create", icon: Wand2 },
              { id: "timeline", label: "Timeline", icon: AlignLeft },
              { id: "storyboard", label: "Storyboard", icon: LayoutGrid },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id ? "text-white" : "text-muted-foreground hover:text-foreground"
                }`}
                style={activeTab === tab.id ? {
                  background: "linear-gradient(135deg, oklch(0.60 0.25 310), oklch(0.65 0.22 285))"
                } : {}}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Create Tab */}
          {activeTab === "create" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="genei-card p-5 rounded-xl space-y-4">
                <label className="text-sm font-semibold text-foreground">Describe your video</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A cinematic drone shot of a futuristic neon city at night, rain-soaked streets reflecting purple and blue lights, slow motion, 4K quality..."
                  rows={4}
                  className="w-full genei-input resize-none"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Aspect Ratio</label>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full genei-input text-sm py-2">
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait</option>
                      <option value="1:1">1:1 Square</option>
                      <option value="4:3">4:3 Classic</option>
                      <option value="21:9">21:9 Cinematic</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Automated Script Translation</label>
                    <div className="flex items-center gap-2 py-1.5">
                      <input type="checkbox" checked={enableTranslation} onChange={(e) => setEnableTranslation(e.target.checked)} className="rounded border-border accent-primary" />
                      <span className="text-xs text-foreground">Translate brief</span>
                      <select aria-label="Target translation language" disabled={!enableTranslation} value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value as any)} className="genei-input text-xs py-1 px-2 disabled:opacity-50">
                        <option value="en">English (EN)</option>
                        <option value="es">Spanish (ES)</option>
                        <option value="fr">French (FR)</option>
                        <option value="ja">Japanese (JA)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Duration: {duration}s</label>
                    <input type="range" min={5} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-purple-500 mt-2" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Style</label>
                    <select className="w-full genei-input text-sm py-2">
                      <option>Cinematic</option>
                      <option>Documentary</option>
                      <option>Anime</option>
                      <option>3D Render</option>
                      <option>Vintage Film</option>
                    </select>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Lip Sync", desc: "Sync audio to video", value: lipSync, set: setLipSync, icon: Mic },
                    { label: "Auto Subtitles", desc: "AI-generated captions", value: autoSubtitles, set: setAutoSubtitles, icon: Subtitles },
                  ].map((toggle) => (
                    <div key={toggle.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
                      <div className="flex items-center gap-2">
                        <toggle.icon className="w-4 h-4 text-primary" />
                        <div>
                          <div className="text-xs font-medium text-foreground">{toggle.label}</div>
                          <div className="text-[10px] text-muted-foreground">{toggle.desc}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggle.set(!toggle.value)}
                        className={`w-9 h-5 rounded-full transition-all duration-200 relative ${toggle.value ? "bg-primary" : "bg-secondary"}`}
                      >
                        <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${toggle.value ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGenerate}
                  className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate Video
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Timeline Tab */}
          {activeTab === "timeline" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Timeline Editor</h3>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                      <Plus className="w-3 h-3" /> Add Clip
                    </button>
                  </div>
                </div>

                {/* Timeline tracks */}
                <div className="space-y-3">
                  {(directorQuery.data?.shots ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Generate a project to populate the continuity-aware timeline.</div>
                  ) : (directorQuery.data?.shots ?? []).map((shot, index) => (
                    <div key={shot.id} className="rounded-lg border border-border/70 bg-secondary/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0"><div className="text-xs font-semibold text-foreground">{index + 1}. {shot.shotKey}</div><div className="truncate text-[10px] text-muted-foreground">{shot.prompt}</div></div>
                        <span className="text-[10px] text-muted-foreground">{shot.status}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary/50 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary to-pink-500" style={{ width: `${Math.max(8, Math.min(100, 100 / Math.max(1, (directorQuery.data?.shots ?? []).length)))}%` }} /></div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Continuity: {shot.startContinuity ? "conditioned" : index === 0 ? "initial" : "missing"}</span>
                        <span>Route: {shot.routeUsed ?? "awaiting provider"}</span>
                        <button type="button" onClick={() => projectId !== null && retryShot.mutate({ projectId, shotId: shot.id, reason: "Timeline review requested a continuity-safe regeneration." })} className="ml-auto rounded-md border border-border px-2 py-1 hover:border-primary/50 hover:text-primary">Regenerate boundary</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Playhead */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, oklch(0.60 0.25 310), oklch(0.65 0.22 285))" }}>
                    <Play className="w-4 h-4 text-white" />
                  </button>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "oklch(0.20 0.02 265)" }}>
                    <div className="h-full w-1/3 rounded-full" style={{ background: "linear-gradient(90deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }} />
                  </div>
                  <span className="text-xs text-muted-foreground">0:05 / 0:15</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Storyboard Tab */}
          {activeTab === "storyboard" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div><h3 className="font-semibold text-foreground">AI Storyboard</h3><p className="text-[10px] text-muted-foreground">Every card is a persisted shot contract, not a placeholder frame.</p></div>
                  <button type="button" onClick={handleGenerate} disabled={isGenerating} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary transition-all disabled:opacity-50">
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Generate storyboard
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(directorQuery.data?.shots ?? []).length === 0 ? (
                    <div className="col-span-full rounded-xl border-2 border-dashed border-border p-8 text-center text-xs text-muted-foreground">No storyboard yet. Generate a video to create scene-by-scene cards.</div>
                  ) : (directorQuery.data?.shots ?? []).map((shot, index) => (
                    <div key={shot.id} className="rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all group">
                      <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-primary/10 to-pink-500/10"><Clapperboard className="w-8 h-8 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" /></div>
                      <div className="p-2.5"><div className="text-xs font-medium text-foreground">{index + 1}. {shot.shotKey}</div><div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{shot.prompt}</div><div className="mt-2 text-[10px] text-primary">{shot.startContinuity ? "Continuity conditioned" : "Opening boundary"}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Integrations + Settings */}
        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-4">
            <h3 className="font-semibold text-foreground font-display flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Integrations
            </h3>
            {integrations.map((int) => (
              <div key={int.name} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: "oklch(0.14 0.02 265)", border: `1px solid ${int.color} / 0.15` }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={{ background: `${int.color} / 0.2`, color: int.color }}>
                    {int.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{int.name}</div>
                    <div className="text-xs text-muted-foreground">{int.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/api?provider=${int.name.toLowerCase()}`)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-primary transition-all"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>

          <div className="genei-card p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground font-display">Export Settings</h3>
            {[
              { label: "Resolution", options: ["720p", "1080p", "4K"] },
              { label: "Format", options: ["MP4", "MOV", "WebM"] },
              { label: "FPS", options: ["24", "30", "60"] },
            ].map((setting) => (
              <div key={setting.label}>
                <label className="text-xs text-muted-foreground mb-1 block">{setting.label}</label>
                    <select value={setting.label === "Resolution" ? resolution : setting.label === "Format" ? format : fps} onChange={(e) => setting.label === "Resolution" ? setResolution(e.target.value) : setting.label === "Format" ? setFormat(e.target.value) : setFps(e.target.value)} className="w-full genei-input text-sm py-2">
                      {setting.options.map(o => <option key={o}>{o}</option>)}
                    </select>
              </div>
            ))}
            <select value={publishTarget} onChange={(e) => setPublishTarget(e.target.value)} className="w-full genei-input text-sm py-2">
              <option value="download">Download file</option>
              <option value="byoh">Render on paired BYOH runner</option>
              <option value="cloud">Render on configured cloud provider</option>
            </select>
            <button type="button" disabled={projectId === null || createExport.isPending} onClick={() => {
              if (projectId === null) { toast.error("Generate a project before exporting"); return; }
              createExport.mutate({ projectId, format: format.toLowerCase(), preset: `${resolution}-${fps}fps`, publishTarget });
            }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-50">
              {createExport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {projectId === null ? "Generate a project to export" : "Queue Export"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
