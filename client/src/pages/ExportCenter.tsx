import React, { useState } from "react";
import { Download, Package, Music, Video, Image, FileText, Smartphone, Globe, CheckCircle, Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const exportFormats = [
  { category: "Audio", formats: ["MP3 320kbps", "WAV 24-bit", "FLAC", "AAC", "OGG"], icon: Music, color: "oklch(0.65 0.22 285)" },
  { category: "Video", formats: ["MP4 H.264", "MP4 H.265", "MOV ProRes", "WebM", "GIF"], icon: Video, color: "oklch(0.60 0.25 310)" },
  { category: "Image", formats: ["PNG", "JPEG", "WebP", "SVG", "PDF"], icon: Image, color: "oklch(0.72 0.18 210)" },
  { category: "Project", formats: ["PWA Source", "Website Blueprint", "AI Director JSON", "Caption SRT"], icon: FileText, color: "oklch(0.68 0.20 155)" },
];

const exportPresets = [
  { id: "youtube-4k", label: "YouTube 4K", resolution: "3840×2160", aspect: "16:9", description: "Landscape master with high-quality audio" },
  { id: "youtube-1080", label: "YouTube 1080p", resolution: "1920×1080", aspect: "16:9", description: "Balanced web delivery" },
  { id: "shorts", label: "Shorts / Reels", resolution: "1080×1920", aspect: "9:16", description: "Vertical mobile-first delivery" },
  { id: "square", label: "Square Social", resolution: "1080×1080", aspect: "1:1", description: "Instagram and social feed format" },
  { id: "master", label: "Production Master", resolution: "Source", aspect: "Original", description: "Preserve source resolution and metadata" },
];

const publishTargets = [
  { id: "download", label: "Download only", description: "Create a downloadable result after the export worker finishes.", icon: Download },
  { id: "asset-library", label: "Save to Asset Library", description: "Keep the result in your private Genei library.", icon: Package },
  { id: "byoh-worker", label: "Send to BYOH worker", description: "Requires a paired workstation with the required tools.", icon: Smartphone },
  { id: "cloud-queue", label: "Queue on cloud worker", description: "Requires a configured cloud-capable provider path.", icon: Globe },
];

export default function ExportCenter() {
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("youtube-1080");
  const [publishTarget, setPublishTarget] = useState("download");
  const { isAuthenticated, loading: authLoading } = useAuth();
  const exportsQuery = trpc.exports.list.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: false });
  const exportJobs = exportsQuery.data;
  const refetch = exportsQuery.refetch;
  const createExportMutation = trpc.exports.create.useMutation();

  const toggleFormat = (format: string) => {
    setSelectedFormats((previous) => previous.includes(format) ? previous.filter((item) => item !== format) : [...previous, format]);
  };

  const handleExport = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in before queueing an export", { description: "Your export jobs and generated files are private to your workspace." });
      return;
    }
    if (!selectedFormats.length) {
      toast.error("Select at least one export format first");
      return;
    }
    try {
      await Promise.all(selectedFormats.map((format) => createExportMutation.mutateAsync({ format, preset: selectedPreset, publishTarget })));
      await refetch();
      toast.success(`${selectedFormats.length} export job${selectedFormats.length > 1 ? "s" : ""} queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to queue export");
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, oklch(0.68 0.20 155), oklch(0.72 0.18 210))", boxShadow: "0 0 20px oklch(0.68 0.20 155 / 0.4)" }}>
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ background: "linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.72 0.18 210))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Export Center</h1>
          <p className="text-xs text-muted-foreground">Choose a delivery preset, output formats, and execution destination</p>
          <span className="mt-2 inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Exports are queued jobs — a download appears only after completion</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="genei-card p-5 rounded-xl">
            <h2 className="font-semibold text-foreground font-display mb-4">Target preset</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {exportPresets.map((preset) => (
                <button type="button" key={preset.id} onClick={() => setSelectedPreset(preset.id)} className={`rounded-xl border p-4 text-left transition-all ${selectedPreset === preset.id ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-foreground">{preset.label}</span><span className="text-[10px] text-primary">{preset.resolution}</span></div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{preset.aspect} · {preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {exportFormats.map((category) => (
            <div key={category.category} className="genei-card p-5 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${category.color} / 0.15` }}><category.icon className="w-4 h-4" style={{ color: category.color }} /></div>
                <h3 className="font-semibold text-foreground font-display">{category.category} formats</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {category.formats.map((format) => (
                  <button type="button" key={format} onClick={() => toggleFormat(format)} className={`min-h-10 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedFormats.includes(format) ? "border-primary/50 text-foreground" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"}`} style={selectedFormats.includes(format) ? { background: `${category.color} / 0.15` } : { background: "oklch(0.13 0.015 265)" }}>{format}</button>
                ))}
              </div>
            </div>
          ))}

          <div className="genei-card p-5 rounded-xl">
            <h2 className="font-semibold text-foreground font-display mb-4">Publishing destination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {publishTargets.map((target) => (
                <button type="button" key={target.id} onClick={() => setPublishTarget(target.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${publishTarget === target.id ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <target.icon className="h-4 w-4 text-primary" /><span><span className="block text-xs text-foreground">{target.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{target.description}</span></span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Download-only is the simplest path. BYOH and cloud destinations stay queued until the required worker/provider is connected; Genei will show a truthful failure state instead of creating a fake download.</p>
          </div>

          <button type="button" onClick={() => void handleExport()} disabled={createExportMutation.isPending} className="w-full min-h-12 genei-btn-primary flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {createExportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {selectedFormats.length > 0 ? `Queue ${selectedFormats.length} Format${selectedFormats.length > 1 ? "s" : ""}` : "Select Formats to Queue"}
          </button>
        </div>

        <div className="space-y-5">
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border"><h3 className="font-semibold text-foreground font-display">Recent Exports</h3></div>
            {authLoading ? <div className="p-6 text-center text-xs text-muted-foreground">Checking sign-in…</div> : !isAuthenticated ? <div className="p-6 text-center"><p className="text-sm font-medium text-foreground">Sign in to see your exports</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Export jobs and download links are private to your workspace.</p></div> : exportsQuery.isError ? <div className="p-6 text-center text-xs text-rose-200">Couldn’t load export jobs. Try again after checking your connection.</div> : (exportJobs ?? []).length === 0 ? <div className="p-6 text-center text-xs text-muted-foreground">No exports queued yet. Select a format to create your first job.</div> : (exportJobs ?? []).map((job) => (
              <div key={job.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">{job.status === "completed" ? <CheckCircle className="w-4 h-4 text-green-400" /> : job.status === "failed" ? <Clock className="w-4 h-4 text-destructive" /> : <Loader2 className="w-4 h-4 animate-spin text-primary" />}</div>
                <div className="flex-1 min-w-0"><div className="text-xs font-medium text-foreground truncate">{job.format}</div><div className="text-[10px] text-muted-foreground">{job.preset} · {job.publishTarget || "download"} · {job.status}</div></div>
                {job.status === "completed" && job.outputUrl ? <a href={job.outputUrl} download className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"><Download className="w-3.5 h-3.5" /></a> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
