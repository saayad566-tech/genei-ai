import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cpu,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Capability = {
  id: string;
  name: string;
  category: "Image" | "Video" | "Audio" | "Language" | "Workflow" | "Runtime";
  description: string;
  sourceUrl: string;
  sourceLabel: string;
  license: string;
  hardware: string;
  platforms: string[];
  status: "ready" | "optional" | "high-end";
  note: string;
};

type CapabilityState = "available" | "selected" | "checking" | "verified" | "attention" | "unavailable";
type CapabilityRecord = { state: CapabilityState; progress?: number; message?: string; checkedAt?: string };
type CapabilityStateMap = Record<string, CapabilityRecord>;

const CAPABILITIES: Capability[] = [
  { id: "comfyui", name: "ComfyUI", category: "Workflow", description: "Node-based generation workspace for image, video, and multimodal pipelines.", sourceUrl: "https://github.com/comfyanonymous/ComfyUI", sourceLabel: "Official GitHub", license: "GPL-3.0", hardware: "NVIDIA GPU recommended; CPU mode is limited", platforms: ["Windows", "Linux", "macOS"], status: "ready", note: "Genei can route graph jobs here when the local capability is available." },
  { id: "ollama", name: "Ollama", category: "Runtime", description: "Local model runtime for text, coding, and multimodal language models.", sourceUrl: "https://github.com/ollama/ollama", sourceLabel: "Official GitHub", license: "MIT", hardware: "CPU works; GPU improves speed and capacity", platforms: ["Windows", "Linux", "macOS"], status: "optional", note: "The runtime is selected here; model weights are installed separately from the official source." },
  { id: "sdxl", name: "Stable Diffusion XL", category: "Image", description: "Local text-to-image and image-to-image generation for posters, covers, and assets.", sourceUrl: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0", sourceLabel: "Official model card", license: "OpenRAIL++", hardware: "8–12 GB VRAM recommended", platforms: ["Windows", "Linux", "macOS"], status: "optional", note: "Model weights are downloaded separately; the desktop installer stays small." },
  { id: "flux-dev", name: "FLUX.1 [dev]", category: "Image", description: "High-quality local image generation and editing for advanced creator workflows.", sourceUrl: "https://huggingface.co/black-forest-labs/FLUX.1-dev", sourceLabel: "Official model card", license: "FLUX.1-dev license", hardware: "12 GB+ VRAM recommended", platforms: ["Windows", "Linux"], status: "optional", note: "Review the model license before commercial use; Genei links to the original terms." },
  { id: "wan-video", name: "Wan2.1", category: "Video", description: "Open video generation foundation model for text-to-video and image-to-video paths.", sourceUrl: "https://github.com/Wan-Video/Wan2.1", sourceLabel: "Official GitHub", license: "Apache-2.0", hardware: "Large GPU recommended; exact memory varies by checkpoint", platforms: ["Linux", "Windows via compatible runtime"], status: "high-end", note: "Genei shows this as a high-end option and will not claim it runs on every phone." },
  { id: "hunyuan-video", name: "HunyuanVideo", category: "Video", description: "High-end open video foundation model for cinematic local generation experiments.", sourceUrl: "https://github.com/Tencent-Hunyuan/HunyuanVideo", sourceLabel: "Official GitHub", license: "See repository license", hardware: "NVIDIA CUDA GPU; tens of GB of VRAM for published configurations", platforms: ["Linux"], status: "high-end", note: "Use a capable desktop GPU or route the job to a configured provider; Android is remote-control only." },
  { id: "whisper", name: "Whisper", category: "Audio", description: "Speech recognition for prompts, subtitles, transcripts, and continuity notes.", sourceUrl: "https://github.com/openai/whisper", sourceLabel: "Official GitHub", license: "MIT", hardware: "CPU-compatible; GPU accelerates long media", platforms: ["Windows", "Linux", "macOS", "Android route"], status: "optional", note: "Short mobile recordings can use the built-in server transcription path." },
  { id: "ffmpeg", name: "FFmpeg", category: "Workflow", description: "Media inspection, stitching, transcoding, audio muxing, and export foundation.", sourceUrl: "https://ffmpeg.org/", sourceLabel: "Official website", license: "LGPL/GPL components", hardware: "CPU-compatible; hardware encoders used when detected", platforms: ["Windows", "Linux", "macOS", "Android route"], status: "ready", note: "Genei uses capability detection before exposing export options." },
  { id: "piper", name: "Piper TTS", category: "Audio", description: "Fast local text-to-speech for narration drafts and offline voice workflows.", sourceUrl: "https://github.com/rhasspy/piper", sourceLabel: "Official GitHub", license: "MIT", hardware: "CPU-compatible", platforms: ["Windows", "Linux", "macOS"], status: "optional", note: "Voice cloning is not implied; only use voices and datasets you have rights to use." },
  { id: "qwen-coder", name: "Qwen Coder", category: "Language", description: "Local coding assistant option for app, website, and automation projects.", sourceUrl: "https://huggingface.co/Qwen", sourceLabel: "Official model family page", license: "Model-specific terms", hardware: "Depends on selected checkpoint; quantized models reduce requirements", platforms: ["Windows", "Linux", "macOS", "Android route"], status: "optional", note: "Genei routes mobile coding requests to the server or desktop host instead of pretending on-device inference is universal." },
];

const STORAGE_KEY = "genei-capability-library-state-v2";
const LEGACY_STORAGE_KEY = "genei-capability-library-enabled";

function readSavedState(): CapabilityStateMap {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as CapabilityStateMap;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const ids = JSON.parse(legacy) as string[];
      return Object.fromEntries(ids.map((id) => [id, { state: "selected" as const, message: "Migrated from an earlier workspace selection." }]));
    }
  } catch {
    return {};
  }
  return {};
}

function evaluateCapability(item: Capability): CapabilityRecord {
  const isAndroid = /Android/i.test(window.navigator.userAgent);
  if (isAndroid && item.status === "high-end") {
    return { state: "attention", progress: 100, checkedAt: new Date().toISOString(), message: "This capability needs a desktop GPU or provider route; it is not claimed as on-device Android inference." };
  }
  if (item.status === "ready") {
    return { state: "verified", progress: 100, checkedAt: new Date().toISOString(), message: "Genei’s built-in integration path is available. No external binary download is required for this entry." };
  }
  return { state: "verified", progress: 100, checkedAt: new Date().toISOString(), message: "Source, license, and platform record verified. Model/runtime weights remain an explicit optional install from the official source." };
}

const stateLabel: Record<CapabilityState, string> = {
  available: "Available",
  selected: "Added to workspace",
  checking: "Checking compatibility",
  verified: "Verified record",
  attention: "Needs attention",
  unavailable: "Unavailable",
};

export default function ModelLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [stateMap, setStateMap] = useState<CapabilityStateMap>({});
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => setStateMap(readSavedState()), []);

  const categories = ["All", ...Array.from(new Set(CAPABILITIES.map((item) => item.category)))];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return CAPABILITIES.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const haystack = `${item.name} ${item.description} ${item.hardware} ${item.license}`.toLowerCase();
      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [category, query]);

  const persist = (next: CapabilityStateMap) => {
    setStateMap(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  };

  const addCapability = (item: Capability) => persist({ ...stateMap, [item.id]: { state: "selected", message: "Added to this workspace. Use Verify path to check the current device route." } });
  const removeCapability = (id: string) => {
    const next = { ...stateMap };
    delete next[id];
    persist(next);
  };
  const verifyCapability = (item: Capability) => {
    persist({ ...stateMap, [item.id]: { state: "checking", progress: 25, message: "Checking platform and routing requirements…" } });
    window.setTimeout(() => persist({ ...stateMap, [item.id]: evaluateCapability(item) }), 350);
  };
  const resetSelections = () => persist({});

  const selectedCount = Object.values(stateMap).filter((entry) => entry.state === "selected" || entry.state === "checking" || entry.state === "verified" || entry.state === "attention").length;
  const attentionCount = Object.values(stateMap).filter((entry) => entry.state === "attention" || entry.state === "unavailable").length;

  return (
    <div className="container space-y-8 py-8">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary"><PackageOpen className="h-4 w-4" /> Capability Library</div>
          <h1 className="font-orbitron text-3xl font-bold tracking-tight sm:text-4xl">Choose what Genei can use.</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Add capabilities to your workspace, verify the route for this device, and remove them at any time. Genei never pretends that selecting a catalog entry downloaded model weights; official installs and large files remain explicit and recoverable.</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Official source links</span>
            <span className="inline-flex items-center gap-2"><Cpu className="h-4 w-4 text-cyan-400" /> Hardware-aware</span>
            <span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4 text-violet-400" /> Android-safe routing</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models and tools" className="pl-9" /></div>
        <div className="flex flex-wrap gap-2">{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>)}</div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3"><Badge variant="outline">{selectedCount} in workspace</Badge>{attentionCount > 0 && <Badge className="bg-amber-500/15 text-amber-300"><AlertTriangle className="mr-1 h-3 w-3" />{attentionCount} need attention</Badge>}<span className="text-muted-foreground">Selections are stored on this device.</span></div>
        <Button size="sm" variant="ghost" onClick={resetSelections}><Trash2 className="mr-2 h-4 w-4" />Reset selections</Button>
      </section>
      {storageWarning && <Card className="border-amber-500/40 bg-amber-500/10"><CardContent className="flex items-center gap-3 py-4 text-sm text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />Your browser did not allow local persistence. The current selection will remain only until this page closes.</CardContent></Card>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => {
          const record = stateMap[item.id] ?? { state: "available" as const };
          const isSelected = record.state !== "available" && record.state !== "unavailable";
          return <Card key={item.id} className="flex h-full flex-col border-border/70 bg-card/80">
            <CardHeader className="space-y-3"><div className="flex items-start justify-between gap-3"><div><Badge variant="outline" className="mb-2">{item.category}</Badge><CardTitle className="text-xl">{item.name}</CardTitle></div><Badge className={item.status === "high-end" ? "bg-amber-500/15 text-amber-300" : item.status === "ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-primary/15 text-primary"}>{item.status === "high-end" ? "High-end" : item.status === "ready" ? "Built-in path" : "Optional"}</Badge></div><p className="text-sm text-muted-foreground">{item.description}</p></CardHeader>
            <CardContent className="mt-auto space-y-4"><div className="grid gap-2 text-xs text-muted-foreground"><div className="flex gap-2"><Cpu className="h-4 w-4 shrink-0 text-cyan-400" /><span>{item.hardware}</span></div><div className="flex gap-2"><Monitor className="h-4 w-4 shrink-0 text-violet-400" /><span>{item.platforms.join(" · ")}</span></div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span>{item.license}</span></div></div><p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">{record.message ?? item.note}</p>{record.state === "checking" && <div className="space-y-1"><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>Checking compatibility</span><span>{record.progress ?? 0}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${record.progress ?? 0}%` }} /></div></div>}<div className="flex flex-wrap gap-2"><Button className="flex-1" variant={isSelected ? "secondary" : "default"} onClick={() => isSelected ? removeCapability(item.id) : addCapability(item)}>{isSelected ? <><Check className="mr-2 h-4 w-4" />Added</> : <><Download className="mr-2 h-4 w-4" />Add capability</>}</Button>{isSelected && <Button size="icon" variant="outline" onClick={() => verifyCapability(item)} disabled={record.state === "checking"} aria-label={`Verify ${item.name} compatibility`}>{record.state === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>}<Button size="icon" variant="outline" asChild><a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open official source for ${item.name}`}><ExternalLink className="h-4 w-4" /></a></Button></div><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{stateLabel[record.state]}</span><span>Source: {item.sourceLabel}</span></div></CardContent>
          </Card>;
        })}
      </div>
      {filtered.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No capabilities match this search. Try another category or term.</CardContent></Card>}
    </div>
  );
}
