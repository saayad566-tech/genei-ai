import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Play, Pause, Wand2, Globe, Download, Loader2, Volume2, Radio, Headphones } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const voices = [
  { id: "alloy", name: "Alloy", desc: "Neutral & balanced", gender: "Neutral", lang: "EN" },
  { id: "echo", name: "Echo", desc: "Deep & resonant", gender: "Male", lang: "EN" },
  { id: "fable", name: "Fable", desc: "Warm & storytelling", gender: "Female", lang: "EN" },
  { id: "onyx", name: "Onyx", desc: "Bold & authoritative", gender: "Male", lang: "EN" },
  { id: "nova", name: "Nova", desc: "Bright & energetic", gender: "Female", lang: "EN" },
  { id: "shimmer", name: "Shimmer", desc: "Soft & gentle", gender: "Female", lang: "EN" },
];

const podcastTemplates = [
  { name: "Interview Style", desc: "Host + guest format", icon: "🎙️" },
  { name: "Solo Monologue", desc: "Single narrator", icon: "🎤" },
  { name: "News Briefing", desc: "Daily news format", icon: "📰" },
  { name: "Storytelling", desc: "Narrative podcast", icon: "📖" },
];

export default function VoiceLab() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("nova");
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [activeTab, setActiveTab] = useState<"tts" | "clone" | "podcast">("tts");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleGenerate = () => {
    if (!text.trim()) { toast.error("Enter text to convert"); return; }
    toast.info("Connect ElevenLabs API to generate voice", { description: "Go to API Integrations to add your key" });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.72 0.18 210))", boxShadow: "0 0 20px oklch(0.65 0.22 285 / 0.4)" }}>
          <Mic className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text">Voice Lab</h1>
          <p className="text-xs text-muted-foreground">AI voice cloning & synthesis</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl max-w-md" style={{ background: "oklch(0.12 0.015 265)", border: "1px solid oklch(0.20 0.02 265)" }}>
        {[
          { id: "tts", label: "Text to Speech", icon: Volume2 },
          { id: "clone", label: "Voice Cloning", icon: Mic },
          { id: "podcast", label: "Podcast Creator", icon: Radio },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === tab.id ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
            style={activeTab === tab.id ? { background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" } : {}}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {activeTab === "tts" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="genei-card p-5 rounded-xl space-y-4">
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">Text to Convert</label>
                  <textarea value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Enter the text you want to convert to speech..."
                    rows={5} className="w-full genei-input resize-none" />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{text.length} characters</span>
                    <span className="text-xs text-muted-foreground">~{Math.ceil(text.length / 15)}s audio</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Speed: {speed.toFixed(1)}x</label>
                    <input type="range" min={0.5} max={2.0} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Pitch: {pitch.toFixed(1)}</label>
                    <input type="range" min={0.5} max={2.0} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-purple-500" />
                  </div>
                </div>

                <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate}
                  className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm">
                  <Wand2 className="w-4 h-4" /> Generate Voice
                </motion.button>

                {/* Audio Player Mockup */}
                <div className="p-4 rounded-xl" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setIsPlaying(!isPlaying)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                      {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                    </button>
                    <div className="flex-1">
                      <div className="h-1.5 rounded-full" style={{ background: "oklch(0.20 0.02 265)" }}>
                        <div className="h-full w-0 rounded-full" style={{ background: "linear-gradient(90deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">0:00</span>
                        <span className="text-[10px] text-muted-foreground">0:00</span>
                      </div>
                    </div>
                    <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "clone" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-5 rounded-xl space-y-4">
                <h3 className="font-semibold text-foreground">Voice Cloning</h3>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer">
                  <Mic className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Upload voice sample</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV — minimum 30 seconds for best results</p>
                  <button className="mt-4 genei-btn-primary text-sm px-6 py-2">Choose File</button>
                </div>
                <div className="p-3 rounded-lg text-xs" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <strong className="text-foreground">ElevenLabs Required</strong>
                  <span className="text-muted-foreground"> — Connect your ElevenLabs API key to enable voice cloning with 99% accuracy.</span>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "podcast" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-5 rounded-xl space-y-4">
                <h3 className="font-semibold text-foreground">Podcast Creator</h3>
                <div className="grid grid-cols-2 gap-3">
                  {podcastTemplates.map((tmpl) => (
                    <div key={tmpl.name} className="p-4 rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-all"
                      style={{ background: "oklch(0.13 0.015 265)" }}
                      onClick={() => toast.info(`Loading ${tmpl.name} template`)}>
                      <div className="text-2xl mb-2">{tmpl.icon}</div>
                      <div className="text-sm font-medium text-foreground">{tmpl.name}</div>
                      <div className="text-xs text-muted-foreground">{tmpl.desc}</div>
                    </div>
                  ))}
                </div>
                <textarea placeholder="Describe your podcast episode topic and key points..." rows={4} className="w-full genei-input resize-none" />
                <button className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm"
                  onClick={() => toast.info("Podcast generation requires ElevenLabs API")}>
                  <Headphones className="w-4 h-4" /> Generate Podcast
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Voice Selection */}
        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground font-display">Select Voice</h3>
            {voices.map((voice) => (
              <button key={voice.id} onClick={() => setSelectedVoice(voice.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedVoice === voice.id ? "border-primary/50" : "border-border hover:border-border/80"}`}
                style={{ background: selectedVoice === voice.id ? "oklch(0.65 0.22 285 / 0.12)" : "oklch(0.13 0.015 265)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
                  style={{ background: selectedVoice === voice.id ? "oklch(0.65 0.22 285 / 0.3)" : "oklch(0.20 0.02 265)", color: selectedVoice === voice.id ? "oklch(0.80 0.18 285)" : "oklch(0.55 0.015 265)" }}>
                  {voice.name[0]}
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-medium ${selectedVoice === voice.id ? "text-foreground" : "text-muted-foreground"}`}>{voice.name}</div>
                  <div className="text-xs text-muted-foreground">{voice.desc}</div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{voice.gender}</span>
              </button>
            ))}
          </div>

          <div className="genei-card p-5 rounded-xl">
            <h3 className="font-semibold text-foreground font-display mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Languages
            </h3>
            <div className="flex flex-wrap gap-2">
              {["English", "Spanish", "French", "German", "Japanese", "Korean", "Portuguese", "Arabic", "Hindi", "Italian"].map((lang) => (
                <span key={lang} className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary cursor-pointer transition-all">
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
