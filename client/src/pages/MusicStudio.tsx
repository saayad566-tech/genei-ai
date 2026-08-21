import { useState } from "react";
import { motion } from "framer-motion";
import {
  Music, Play, Mic, Wand2, Sliders, Globe,
  ChevronDown, Loader2, Download, Share2, Heart,
  Volume2, Clock, Zap, Plus, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const genres = ["Hip-Hop", "Pop", "Rock", "Electronic", "Jazz", "Classical", "R&B", "Country", "Metal", "Lo-fi", "Ambient", "Trap", "House", "Techno", "Reggae"];
const moods = ["Energetic", "Chill", "Dark", "Happy", "Sad", "Epic", "Romantic", "Aggressive", "Dreamy", "Mysterious"];
const languages = ["English", "Spanish", "French", "Japanese", "Korean", "Portuguese", "German", "Italian", "Hindi", "Arabic"];

const integrations = [
  { name: "Suno", desc: "AI music generation", color: "oklch(0.65 0.22 285)", status: "Connect" },
  { name: "Udio", desc: "High-quality AI songs", color: "oklch(0.60 0.25 310)", status: "Connect" },
  { name: "ElevenLabs", desc: "Voice cloning & TTS", color: "oklch(0.72 0.18 210)", status: "Connect" },
  { name: "OpenAI", desc: "Lyrics & creativity", color: "oklch(0.68 0.20 155)", status: "Connect" },
];

const sampleTracks = [
  { title: "Neon Dreams", genre: "Synthwave", duration: "3:42", plays: "12.4K" },
  { title: "Midnight Cipher", genre: "Hip-Hop", duration: "2:58", plays: "8.1K" },
  { title: "Cosmic Flow", genre: "Ambient", duration: "5:12", plays: "21.7K" },
];

export default function MusicStudio() {
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [genre, setGenre] = useState("Electronic");
  const [mood, setMood] = useState("Energetic");
  const [bpm, setBpm] = useState(128);
  const [language, setLanguage] = useState("English");
  const [activeTab, setActiveTab] = useState<"create" | "lyrics" | "voice">("create");
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoMaster, setAutoMaster] = useState(true);

  const generateLyricsMutation = trpc.ai.generateLyrics.useMutation();

  const handleGenerateLyrics = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt first"); return; }
    setIsGenerating(true);
    try {
      const result = await generateLyricsMutation.mutateAsync({ topic: prompt, genre, mood, language });
      setLyrics(typeof result.lyrics === "string" ? result.lyrics : "");
      setActiveTab("lyrics");
      toast.success("Lyrics generated!");
    } catch {
      toast.error("Failed to generate lyrics");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSong = () => {
    toast.info("Full-song generation needs a provider", { description: "Connect Suno or Udio in API Integrations. Lyrics generation is live with Genei’s AI gateway." });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))", boxShadow: "0 0 20px oklch(0.65 0.22 285 / 0.4)" }}>
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display genei-gradient-text">Music Studio</h1>
              <p className="text-xs text-muted-foreground">AI-powered music creation</p>
              <span className="mt-2 inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Live: lyrics generation · Requires provider: full songs and voice cloning</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="genei-badge-purple">Lyrics live</span>
          <span className="genei-badge-cyan">Full song: provider required</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Creator Panel */}
        <div className="xl:col-span-2 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "oklch(0.12 0.015 265)", border: "1px solid oklch(0.20 0.02 265)" }}>
            {[
              { id: "create", label: "Create Song", icon: Wand2 },
              { id: "lyrics", label: "Lyrics Generator", icon: Music },
              { id: "voice", label: "Voice Cloning", icon: Mic },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={activeTab === tab.id ? {
                  background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))"
                } : {}}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Create Song Tab */}
          {activeTab === "create" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="genei-card p-5 rounded-xl space-y-4">
                <label className="text-sm font-semibold text-foreground">Describe your song</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A dark cyberpunk hip-hop track with heavy 808s, futuristic synths, and a mysterious female vocal hook about AI taking over..."
                  rows={4}
                  className="w-full genei-input resize-none"
                />

                {/* Controls Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Genre</label>
                    <select
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full genei-input text-sm py-2"
                    >
                      {genres.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Mood</label>
                    <select
                      value={mood}
                      onChange={(e) => setMood(e.target.value)}
                      className="w-full genei-input text-sm py-2"
                    >
                      {moods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">BPM: {bpm}</label>
                    <input
                      type="range" min={60} max={200} value={bpm}
                      onChange={(e) => setBpm(Number(e.target.value))}
                      className="w-full accent-purple-500 mt-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full genei-input text-sm py-2"
                    >
                      {languages.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {/* Auto Master Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-foreground">Auto Mastering</div>
                      <div className="text-xs text-muted-foreground">Professional studio quality</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoMaster(!autoMaster)}
                    className={`w-11 h-6 rounded-full transition-all duration-200 relative ${autoMaster ? "bg-primary" : "bg-secondary"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-200 ${autoMaster ? "left-6" : "left-1"}`} />
                  </button>
                </div>

                <div className="flex gap-3">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGenerateLyrics}
                    disabled={isGenerating || !prompt.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border border-primary/40 text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                    Generate Lyrics
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGenerateSong}
                    className="flex-1 genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate full song
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Lyrics Tab */}
          {activeTab === "lyrics" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="genei-card p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground">Lyrics Generator</label>
                  <button
                    onClick={handleGenerateLyrics}
                    disabled={isGenerating || !prompt.trim()}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                </div>
                {!prompt.trim() && (
                  <div className="p-3 rounded-lg text-sm text-muted-foreground" style={{ background: "oklch(0.14 0.02 265)" }}>
                    Go to "Create Song" tab and enter a prompt first.
                  </div>
                )}
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Your AI-generated lyrics will appear here..."
                  rows={12}
                  className="w-full genei-input resize-none font-mono text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => toast.info("Lyrics export is not connected yet", { description: "Copy the generated lyrics from the editor while export formats are being connected." })} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                    <Download className="w-4 h-4" /> Export
                  </button>
                  <button onClick={() => toast.info("Sharing is not connected yet", { description: "Your lyrics remain in this workspace until a sharing destination is configured." })} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Voice Cloning Tab */}
          {activeTab === "voice" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="genei-card p-5 rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Voice Cloning</h3>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                  <Mic className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Voice cloning preview</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A — upload is enabled after a voice provider is connected</p>
                  <button type="button" onClick={() => toast.info("Voice cloning needs ElevenLabs", { description: "Connect an ElevenLabs key in API Integrations before uploading a sample." })} className="mt-4 genei-btn-primary text-sm px-6 py-2">
                    Check provider setup
                  </button>
                </div>
                <div className="p-3 rounded-lg text-xs text-muted-foreground" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <strong className="text-foreground">ElevenLabs Integration Required</strong> — Connect your ElevenLabs API key in the API Integrations panel to enable voice cloning.
                </div>
              </div>
            </motion.div>
          )}

          {/* Sample Tracks */}
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground font-display">Example Tracks</h3>
              <span className="text-xs text-muted-foreground">Preview library</span>
            </div>
            {sampleTracks.map((track, i) => (
              <div key={track.title} className={`flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors ${i < sampleTracks.length - 1 ? "border-b border-border" : ""}`}>
                <button
                  onClick={() => toast.info("Community audio is preview-only", { description: "Playback, likes, and downloads will be available when the library is connected." })}
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285 / 0.3), oklch(0.60 0.25 310 / 0.3))" }}
                >
                  <Play className="w-4 h-4 text-primary" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{track.title}</div>
                  <div className="text-xs text-muted-foreground">{track.genre}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{track.duration}</span>
                  <span className="text-[10px] text-muted-foreground">Preview only</span>
                  <button onClick={() => toast.info("Likes are not connected yet")} aria-label={`Like ${track.title} preview`} className="hover:text-red-400 transition-colors"><Heart className="w-4 h-4" /></button>
                  <button onClick={() => toast.info("Community downloads are not connected yet")} aria-label={`Download ${track.title} preview`} className="hover:text-primary transition-colors"><Download className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Integrations */}
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
                  {int.status}
                </button>
              </div>
            ))}
          </div>

          {/* BPM Visualizer */}
          <div className="genei-card p-5 rounded-xl">
            <h3 className="font-semibold text-foreground font-display mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" /> Sound Profile
            </h3>
            <div className="space-y-3">
              {[
                { label: "Bass", value: 75 },
                { label: "Treble", value: 60 },
                { label: "Reverb", value: 40 },
                { label: "Compression", value: 85 },
              ].map((param) => (
                <div key={param.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{param.label}</span>
                    <span className="text-foreground">{param.value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "oklch(0.20 0.02 265)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${param.value}%`,
                      background: "linear-gradient(90deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))"
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-language */}
          <div className="genei-card p-5 rounded-xl">
            <h3 className="font-semibold text-foreground font-display mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Multi-Language
            </h3>
            <div className="flex flex-wrap gap-2">
              {["EN", "ES", "FR", "JP", "KR", "PT", "DE", "AR"].map((lang) => (
                <span key={lang} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary cursor-pointer transition-all">
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
