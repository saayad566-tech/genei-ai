import React, { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image, Wand2, Download, Share2, Heart, Zap, Loader2,
  Maximize2, Trash2, Copy, RefreshCw, Sparkles, Plus, AlertTriangle,
  ChevronDown, Grid3X3, LayoutList
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { VoicePromptButton } from "@/components/VoicePromptButton";

const stylePresets = [
  { id: "realistic", label: "Photorealistic", emoji: "📸" },
  { id: "anime", label: "Anime", emoji: "🎌" },
  { id: "cinematic", label: "Cinematic", emoji: "🎬" },
  { id: "oil-painting", label: "Oil Painting", emoji: "🎨" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🌆" },
  { id: "watercolor", label: "Watercolor", emoji: "🖌️" },
  { id: "3d-render", label: "3D Render", emoji: "🔮" },
  { id: "pixel-art", label: "Pixel Art", emoji: "👾" },
  { id: "poster", label: "Poster", emoji: "🪧" },
  { id: "album-cover", label: "Album Cover", emoji: "🎵" },
  { id: "thumbnail", label: "Thumbnail", emoji: "▶️" },
  { id: "logo", label: "Logo", emoji: "✨" },
];

const integrations = [
  { name: "DALL·E", desc: "OpenAI image generation", color: "oklch(0.65 0.22 285)" },
  { name: "Midjourney", desc: "Artistic AI images", color: "oklch(0.60 0.25 310)" },
  { name: "Flux", desc: "Fast image generation", color: "oklch(0.72 0.18 210)" },
  { name: "Stable Diffusion", desc: "Open-source AI art", color: "oklch(0.78 0.18 75)" },
];

const aspectRatios = [
  { label: "1:1", w: 1, h: 1 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
];

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [selectedRatio, setSelectedRatio] = useState("1:1");
  const [upscale, setUpscale] = useState(false);
  const [bgRemover, setBgRemover] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedImages, setSavedImages] = useState<Array<{ url: string; prompt: string; id: string }>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generateMutation = trpc.ai.generateImage.useMutation();
  const saveAssetMutation = trpc.assets.importRemote.useMutation();

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setPrompt((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt to generate an image"); return; }
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedImage(null);
    try {
      const stylePrompt = [
        prompt.trim(),
        `${selectedStyle} style`,
        `aspect ratio ${selectedRatio}`,
        "high quality, detailed",
        negativePrompt.trim() ? `Avoid: ${negativePrompt.trim()}` : "",
        upscale ? "preserve fine detail for high-resolution output" : "",
        bgRemover ? "keep the primary subject cleanly separated from the background" : "",
      ].filter(Boolean).join(", ");
      const result = await generateMutation.mutateAsync({ prompt: stylePrompt });
      setGeneratedImage(result.url ?? null);
      toast.success("Image generated!");
    } catch (err: any) {
      const message = err?.message || "Generation failed or timed out. Check your model connection and try again.";
      setGenerationError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedImage) return;
    try {
      const saved = await saveAssetMutation.mutateAsync({
        name: prompt.slice(0, 50) || "Generated Image",
        type: "image",
        remoteUrl: generatedImage,
        prompt,
        mimeType: "image/png",
      });
      setSavedImages(prev => [{ url: saved.url, prompt, id: String(saved.id) }, ...prev]);
      toast.success("Saved to Asset Library!");
    } catch {
      toast.error("Failed to save image");
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `genei-ai-${Date.now()}.png`;
    a.click();
  };

  const examplePrompts = [
    "A cyberpunk city at night with neon reflections on wet streets",
    "Portrait of a futuristic AI being with glowing circuit patterns",
    "Epic fantasy landscape with floating islands and aurora borealis",
    "Minimalist logo design for a tech startup, geometric shapes",
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.72 0.18 210), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.72 0.18 210 / 0.4)" }}>
            <Image className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display genei-gradient-text-cyan">Image Generator</h1>
            <p className="text-xs text-muted-foreground">Live AI image creation</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="genei-badge-cyan">Live Generation</span>
          <span className="genei-badge-purple">4K Upscaling</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Controls */}
        <div className="xl:col-span-1 space-y-4">
          <div className="genei-card p-5 rounded-xl space-y-4">
            {/* Prompt */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Describe your image</label>
              <div className="flex items-start gap-2">
                <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A futuristic neon city at night, cyberpunk aesthetic, ultra detailed, 8K..."
                rows={4}
                className="w-full genei-input resize-none text-sm"
                />
                <VoicePromptButton onTranscript={handleVoiceTranscript} disabled={isGenerating} />
              </div>
              {/* Example prompts */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {examplePrompts.slice(0, 2).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all truncate max-w-[180px]"
                  >
                    {ex.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Style Presets */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium">Style Preset</label>
              <div className="grid grid-cols-3 gap-1.5">
                {stylePresets.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg text-[10px] font-medium transition-all duration-150 ${
                      selectedStyle === style.id
                        ? "border-primary/50 text-foreground"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    } border`}
                    style={selectedStyle === style.id ? {
                      background: "oklch(0.65 0.22 285 / 0.15)"
                    } : { background: "oklch(0.13 0.015 265)" }}
                  >
                    <span className="text-base">{style.emoji}</span>
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium">Aspect Ratio</label>
              <div className="flex gap-2">
                {aspectRatios.map((ratio) => (
                  <button
                    key={ratio.label}
                    onClick={() => setSelectedRatio(ratio.label)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                      selectedRatio === ratio.label
                        ? "border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80"
                    }`}
                    style={selectedRatio === ratio.label ? { background: "oklch(0.65 0.22 285 / 0.15)" } : { background: "oklch(0.13 0.015 265)" }}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="space-y-2">
              {[
                { label: "4K Upscaling", desc: "Enhance resolution", value: upscale, set: setUpscale },
                { label: "Background Remover", desc: "Transparent PNG", value: bgRemover, set: setBgRemover },
              ].map((toggle) => (
                <div key={toggle.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <div>
                    <div className="text-xs font-medium text-foreground">{toggle.label}</div>
                    <div className="text-[10px] text-muted-foreground">{toggle.desc}</div>
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

            {/* Advanced Options */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              Advanced Options
            </button>

            {showAdvanced && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Negative Prompt</label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to exclude: blurry, low quality, distorted..."
                    rows={2}
                    className="w-full genei-input resize-none text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Steps: 30</label>
                  <input type="range" min={10} max={50} defaultValue={30} className="w-full accent-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">CFG Scale: 7</label>
                  <input type="range" min={1} max={20} defaultValue={7} className="w-full accent-purple-500" />
                </div>
              </motion.div>
            )}

            {/* Generate Button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate Image
                </>
              )}
            </motion.button>
          </div>

          {/* Integrations */}
          <div className="genei-card p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Integrations
            </h3>
            {integrations.map((int) => (
              <div key={int.name} className="flex items-center justify-between p-2.5 rounded-lg"
                style={{ background: "oklch(0.14 0.02 265)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `${int.color} / 0.2`, color: int.color }}>
                    {int.name[0]}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{int.name}</div>
                    <div className="text-[10px] text-muted-foreground">{int.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => toast.info(`Connect ${int.name} in API Integrations`)}
                  className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Output */}
        <div className="xl:col-span-2 space-y-5">
          {/* Generated Image */}
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground font-display">Generated Output</h3>
              {generatedImage && (
                <div className="flex gap-2">
                  <button onClick={handleSave} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                    <Heart className="w-3.5 h-3.5" /> Save
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button onClick={() => { setPrompt(prompt); handleGenerate(); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </button>
                </div>
              )}
            </div>

            {generationError && !isGenerating && (
              <div role="alert" aria-live="polite" className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{generationError}</span>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={!prompt.trim()}
                  className="min-h-11 flex-shrink-0 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="relative min-h-[400px] flex items-center justify-center p-6"
              style={{ background: "oklch(0.09 0.01 265)" }}>
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <div className="relative w-20 h-20">
                      <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                      <div className="absolute inset-2 rounded-full border-2 border-primary/40 animate-spin" style={{ animationDuration: "2s" }} />
                      <div className="absolute inset-4 rounded-full flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285 / 0.3), oklch(0.60 0.25 310 / 0.3))" }}>
                        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Generating your image...</p>
                      <p className="text-xs text-muted-foreground mt-1">This may take 10–20 seconds</p>
                    </div>
                    <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.20 0.02 265)" }}>
                      <div className="h-full rounded-full genei-shimmer" style={{ width: "60%" }} />
                    </div>
                  </motion.div>
                ) : generatedImage ? (
                  <motion.div
                    key="image"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative group"
                  >
                    <img
                      src={generatedImage}
                      alt={prompt}
                      className="max-w-full max-h-[500px] rounded-xl object-contain"
                      style={{ boxShadow: "0 0 40px oklch(0.65 0.22 285 / 0.2)" }}
                    />
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button className="p-2 rounded-lg bg-black/60 text-white">
                        <Maximize2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4 text-center"
                  >
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                      style={{ background: "oklch(0.65 0.22 285 / 0.1)", border: "1px dashed oklch(0.65 0.22 285 / 0.3)" }}>
                      <Image className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Your image will appear here</p>
                      <p className="text-xs text-muted-foreground mt-1">Enter a prompt and click Generate</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                      {examplePrompts.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setPrompt(ex)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                        >
                          {ex.slice(0, 35)}...
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {generatedImage && (
              <div className="p-4 border-t border-border">
                <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Prompt:</span> {prompt}</p>
                <div className="flex gap-2 mt-2">
                  <span className="genei-badge-purple text-[10px]">{selectedStyle}</span>
                  <span className="genei-badge-cyan text-[10px]">{selectedRatio}</span>
                  {upscale && <span className="genei-badge-gold text-[10px]">4K Upscaled</span>}
                </div>
              </div>
            )}
          </div>

          {/* Saved Images Gallery */}
          {savedImages.length > 0 && (
            <div className="genei-card rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground font-display">Saved Images</h3>
                <div className="flex gap-1">
                  <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "text-primary" : "text-muted-foreground"}`}>
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "text-primary" : "text-muted-foreground"}`}>
                    <LayoutList className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className={`p-4 ${viewMode === "grid" ? "grid grid-cols-3 sm:grid-cols-4 gap-3" : "space-y-2"}`}>
                {savedImages.map((img) => (
                  <div key={img.id} className={viewMode === "grid" ? "relative group rounded-xl overflow-hidden aspect-square" : "flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/30"}>
                    <img src={img.url} alt={img.prompt} className={viewMode === "grid" ? "w-full h-full object-cover" : "w-12 h-12 rounded-lg object-cover"} />
                    {viewMode === "grid" && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end opacity-0 group-hover:opacity-100 p-2">
                        <p className="text-[10px] text-white line-clamp-2">{img.prompt}</p>
                      </div>
                    )}
                    {viewMode === "list" && (
                      <p className="text-xs text-muted-foreground flex-1 truncate">{img.prompt}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
