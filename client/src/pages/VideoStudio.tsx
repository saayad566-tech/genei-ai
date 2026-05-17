import { useState } from "react";
import { motion } from "framer-motion";
import {
  Video, Play, Pause, Film, Clapperboard, Subtitles,
  Wand2, Zap, Clock, Download, Share2, Plus, Layers,
  AlignLeft, Mic, ChevronRight, Loader2, LayoutGrid
} from "lucide-react";
import { toast } from "sonner";

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

  const handleGenerate = () => {
    if (!prompt.trim()) { toast.error("Enter a video description first"); return; }
    toast.info("Connect Runway or Pika API to generate videos", { description: "Go to API Integrations to add your keys" });
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
        <div className="flex gap-2">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Panel */}
        <div className="xl:col-span-2 space-y-5">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                <div className="space-y-2">
                  {["Video", "Audio", "Subtitles", "Effects"].map((track, i) => (
                    <div key={track} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-muted-foreground flex-shrink-0">{track}</div>
                      <div className="flex-1 h-10 rounded-lg relative overflow-hidden" style={{ background: "oklch(0.14 0.02 265)" }}>
                        {i === 0 && (
                          <div className="absolute left-0 top-0 bottom-0 rounded-lg flex items-center px-2"
                            style={{ width: "70%", background: "linear-gradient(90deg, oklch(0.65 0.22 285 / 0.4), oklch(0.60 0.25 310 / 0.4))", border: "1px solid oklch(0.65 0.22 285 / 0.3)" }}>
                            <span className="text-xs text-foreground truncate">Main Clip</span>
                          </div>
                        )}
                        {i === 1 && (
                          <div className="absolute left-0 top-0 bottom-0 rounded-lg flex items-center px-2"
                            style={{ width: "80%", background: "linear-gradient(90deg, oklch(0.72 0.18 210 / 0.4), oklch(0.68 0.20 155 / 0.4))", border: "1px solid oklch(0.72 0.18 210 / 0.3)" }}>
                            <span className="text-xs text-foreground truncate">Background Music</span>
                          </div>
                        )}
                        {i === 2 && (
                          <div className="absolute left-4 top-0 bottom-0 rounded-lg flex items-center px-2"
                            style={{ width: "60%", background: "oklch(0.78 0.18 75 / 0.3)", border: "1px solid oklch(0.78 0.18 75 / 0.3)" }}>
                            <span className="text-xs text-foreground truncate">Auto Captions</span>
                          </div>
                        )}
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
                  <h3 className="font-semibold text-foreground">AI Storyboard</h3>
                  <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                    <Wand2 className="w-3 h-3" /> Auto Generate
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {storyboardFrames.map((frame) => (
                    <div key={frame.id} className="rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all cursor-pointer group">
                      <div className="aspect-video flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, oklch(${0.10 + frame.id * 0.01} 0.015 ${265 + frame.id * 5}), oklch(${0.14 + frame.id * 0.01} 0.02 ${285 + frame.id * 5}))` }}>
                        <Clapperboard className="w-8 h-8 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                      </div>
                      <div className="p-2.5">
                        <div className="text-xs font-medium text-foreground">{frame.id}. {frame.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{frame.desc}</div>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-all cursor-pointer flex items-center justify-center aspect-video">
                    <Plus className="w-6 h-6 text-muted-foreground" />
                  </div>
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
                  onClick={() => toast.info(`Go to API Integrations to connect ${int.name}`)}
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
                <select className="w-full genei-input text-sm py-2">
                  {setting.options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
              <Download className="w-4 h-4" /> Export Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
