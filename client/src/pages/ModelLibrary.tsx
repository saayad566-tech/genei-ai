import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Check, Download, Search, ShieldCheck, Smartphone, Monitor, Cpu, PackageOpen } from "lucide-react";
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

const CAPABILITIES: Capability[] = [
  {
    id: "comfyui",
    name: "ComfyUI",
    category: "Workflow",
    description: "Node-based generation workspace for image, video, and multimodal pipelines.",
    sourceUrl: "https://github.com/comfyanonymous/ComfyUI",
    sourceLabel: "Official GitHub",
    license: "GPL-3.0",
    hardware: "NVIDIA GPU recommended; CPU mode is limited",
    platforms: ["Windows", "Linux", "macOS"],
    status: "ready",
    note: "Genei can route graph jobs here when the local capability is available.",
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "Runtime",
    description: "Local model runtime for text, coding, and multimodal language models.",
    sourceUrl: "https://github.com/ollama/ollama",
    sourceLabel: "Official GitHub",
    license: "MIT",
    hardware: "CPU works; GPU improves speed and capacity",
    platforms: ["Windows", "Linux", "macOS"],
    status: "optional",
    note: "Use local models when detected; otherwise Genei falls back to configured providers.",
  },
  {
    id: "sdxl",
    name: "Stable Diffusion XL",
    category: "Image",
    description: "Local text-to-image and image-to-image generation for posters, covers, and assets.",
    sourceUrl: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
    sourceLabel: "Official model card",
    license: "OpenRAIL++",
    hardware: "8–12 GB VRAM recommended",
    platforms: ["Windows", "Linux", "macOS"],
    status: "optional",
    note: "Model weights are downloaded separately; the desktop installer stays small.",
  },
  {
    id: "flux-dev",
    name: "FLUX.1 [dev]",
    category: "Image",
    description: "High-quality local image generation and editing for advanced creator workflows.",
    sourceUrl: "https://huggingface.co/black-forest-labs/FLUX.1-dev",
    sourceLabel: "Official model card",
    license: "FLUX.1-dev license",
    hardware: "12 GB+ VRAM recommended",
    platforms: ["Windows", "Linux"],
    status: "optional",
    note: "Review the model license before commercial use; Genei links to the original terms.",
  },
  {
    id: "wan-video",
    name: "Wan2.1",
    category: "Video",
    description: "Open video generation foundation model for text-to-video and image-to-video paths.",
    sourceUrl: "https://github.com/Wan-Video/Wan2.1",
    sourceLabel: "Official GitHub",
    license: "Apache-2.0",
    hardware: "Large GPU recommended; exact memory varies by checkpoint",
    platforms: ["Linux", "Windows via compatible runtime"],
    status: "high-end",
    note: "Genei shows this as a high-end option and will not claim it runs on every phone.",
  },
  {
    id: "hunyuan-video",
    name: "HunyuanVideo",
    category: "Video",
    description: "High-end open video foundation model for cinematic local generation experiments.",
    sourceUrl: "https://github.com/Tencent-Hunyuan/HunyuanVideo",
    sourceLabel: "Official GitHub",
    license: "See repository license",
    hardware: "NVIDIA CUDA GPU; tens of GB of VRAM for published configurations",
    platforms: ["Linux"],
    status: "high-end",
    note: "Use a capable desktop GPU or route the job to a configured provider; Android is remote-control only.",
  },
  {
    id: "whisper",
    name: "Whisper",
    category: "Audio",
    description: "Speech recognition for prompts, subtitles, transcripts, and continuity notes.",
    sourceUrl: "https://github.com/openai/whisper",
    sourceLabel: "Official GitHub",
    license: "MIT",
    hardware: "CPU-compatible; GPU accelerates long media",
    platforms: ["Windows", "Linux", "macOS", "Android route"],
    status: "optional",
    note: "Short mobile recordings can use the built-in server transcription path.",
  },
  {
    id: "ffmpeg",
    name: "FFmpeg",
    category: "Workflow",
    description: "Media inspection, stitching, transcoding, audio muxing, and export foundation.",
    sourceUrl: "https://ffmpeg.org/",
    sourceLabel: "Official website",
    license: "LGPL/GPL components",
    hardware: "CPU-compatible; hardware encoders used when detected",
    platforms: ["Windows", "Linux", "macOS", "Android route"],
    status: "ready",
    note: "Genei uses capability detection before exposing export options.",
  },
  {
    id: "piper",
    name: "Piper TTS",
    category: "Audio",
    description: "Fast local text-to-speech for narration drafts and offline voice workflows.",
    sourceUrl: "https://github.com/rhasspy/piper",
    sourceLabel: "Official GitHub",
    license: "MIT",
    hardware: "CPU-compatible",
    platforms: ["Windows", "Linux", "macOS"],
    status: "optional",
    note: "Voice cloning is not implied; only use voices and datasets you have rights to use.",
  },
  {
    id: "qwen-coder",
    name: "Qwen Coder",
    category: "Language",
    description: "Local coding assistant option for app, website, and automation projects.",
    sourceUrl: "https://huggingface.co/Qwen",
    sourceLabel: "Official model family page",
    license: "Model-specific terms",
    hardware: "Depends on selected checkpoint; quantized models reduce requirements",
    platforms: ["Windows", "Linux", "macOS", "Android route"],
    status: "optional",
    note: "Genei routes mobile coding requests to the server or desktop host instead of pretending on-device inference is universal.",
  },
];

const STORAGE_KEY = "genei-capability-library-enabled";

export default function ModelLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [enabled, setEnabled] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setEnabled(JSON.parse(saved) as string[]);
    } catch {
      setEnabled([]);
    }
  }, []);

  const categories = ["All", ...Array.from(new Set(CAPABILITIES.map((item) => item.category)))];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return CAPABILITIES.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const haystack = `${item.name} ${item.description} ${item.hardware} ${item.license}`.toLowerCase();
      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [category, query]);

  const toggleEnabled = (id: string) => {
    const next = enabled.includes(id) ? enabled.filter((item) => item !== id) : [...enabled, id];
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="container py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary"><PackageOpen className="h-4 w-4" /> Capability Library</div>
          <h1 className="font-orbitron text-3xl font-bold tracking-tight sm:text-4xl">Choose what Genei can use.</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Enable capabilities for your workspace. Genei detects the computer, keeps large weights optional, and routes unsupported jobs to your configured provider or unified desktop host. No runner or pairing step is required.</p>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => {
          const isEnabled = enabled.includes(item.id);
          return <Card key={item.id} className="flex h-full flex-col border-border/70 bg-card/80">
            <CardHeader className="space-y-3"><div className="flex items-start justify-between gap-3"><div><Badge variant="outline" className="mb-2">{item.category}</Badge><CardTitle className="text-xl">{item.name}</CardTitle></div><Badge className={item.status === "high-end" ? "bg-amber-500/15 text-amber-300" : item.status === "ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-primary/15 text-primary"}>{item.status === "high-end" ? "High-end" : item.status === "ready" ? "Built-in path" : "Optional"}</Badge></div><p className="text-sm text-muted-foreground">{item.description}</p></CardHeader>
            <CardContent className="mt-auto space-y-4"><div className="grid gap-2 text-xs text-muted-foreground"><div className="flex gap-2"><Cpu className="h-4 w-4 shrink-0 text-cyan-400" /><span>{item.hardware}</span></div><div className="flex gap-2"><Monitor className="h-4 w-4 shrink-0 text-violet-400" /><span>{item.platforms.join(" · ")}</span></div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /><span>{item.license}</span></div></div><p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">{item.note}</p><div className="flex gap-2"><Button className="flex-1" variant={isEnabled ? "secondary" : "default"} onClick={() => toggleEnabled(item.id)}>{isEnabled ? <><Check className="mr-2 h-4 w-4" />Enabled</> : <><Download className="mr-2 h-4 w-4" />Enable capability</>}</Button><Button size="icon" variant="outline" asChild><a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open official source for ${item.name}`}><ExternalLink className="h-4 w-4" /></a></Button></div><div className="text-[11px] text-muted-foreground">Source: {item.sourceLabel}</div></CardContent>
          </Card>;
        })}
      </div>
      {filtered.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No capabilities match this search. Try another category or term.</CardContent></Card>}
    </div>
  );
}
