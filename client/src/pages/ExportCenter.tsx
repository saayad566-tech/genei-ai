import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Package, Music, Video, Image, FileText, Smartphone, Globe, Zap, CheckCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

const exportFormats = [
  { category: "Audio", formats: ["MP3 320kbps", "WAV 24-bit", "FLAC", "AAC", "OGG"], icon: Music, color: "oklch(0.65 0.22 285)" },
  { category: "Video", formats: ["MP4 4K", "MP4 1080p", "MOV", "WebM", "GIF"], icon: Video, color: "oklch(0.60 0.25 310)" },
  { category: "Image", formats: ["PNG 4K", "JPEG", "WebP", "SVG", "PDF"], icon: Image, color: "oklch(0.72 0.18 210)" },
  { category: "App", formats: ["APK (Android)", "IPA (iOS)", "PWA Bundle", "React Native"], icon: Smartphone, color: "oklch(0.78 0.18 75)" },
  { category: "Website", formats: ["HTML/CSS/JS", "Next.js", "Static Site", "ZIP Archive"], icon: Globe, color: "oklch(0.68 0.20 155)" },
];

const recentExports = [
  { name: "cyberpunk_city.png", type: "image", size: "4.2MB", status: "completed", time: "2 min ago" },
  { name: "neon_beat.mp3", type: "audio", size: "8.7MB", status: "completed", time: "15 min ago" },
  { name: "promo_video.mp4", type: "video", size: "124MB", status: "processing", time: "Just now" },
];

export default function ExportCenter() {
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);

  const toggleFormat = (fmt: string) => {
    setSelectedFormats(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.68 0.20 155), oklch(0.72 0.18 210))", boxShadow: "0 0 20px oklch(0.68 0.20 155 / 0.4)" }}>
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ background: "linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.72 0.18 210))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Export Center</h1>
          <p className="text-xs text-muted-foreground">Download and distribute your creations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {exportFormats.map((category) => (
            <div key={category.category} className="genei-card p-5 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${category.color} / 0.15` }}>
                  <category.icon className="w-4 h-4" style={{ color: category.color }} />
                </div>
                <h3 className="font-semibold text-foreground font-display">{category.category} Formats</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {category.formats.map((fmt) => (
                  <button key={fmt} onClick={() => toggleFormat(fmt)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedFormats.includes(fmt) ? "border-primary/50 text-foreground" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"}`}
                    style={selectedFormats.includes(fmt) ? { background: `${category.color} / 0.15` } : { background: "oklch(0.13 0.015 265)" }}>
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => selectedFormats.length ? toast.success("Export started!") : toast.error("Select export formats first")}
            className="w-full genei-btn-primary flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold">
            <Package className="w-4 h-4" />
            {selectedFormats.length > 0 ? `Export ${selectedFormats.length} Format${selectedFormats.length > 1 ? "s" : ""}` : "Select Formats to Export"}
          </button>
        </div>

        {/* Recent Exports */}
        <div className="space-y-5">
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground font-display">Recent Exports</h3>
            </div>
            {recentExports.map((exp, i) => (
              <div key={exp.name} className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${i < recentExports.length - 1 ? "border-b border-border" : ""}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: exp.type === "image" ? "oklch(0.72 0.18 210 / 0.15)" : exp.type === "audio" ? "oklch(0.65 0.22 285 / 0.15)" : "oklch(0.60 0.25 310 / 0.15)" }}>
                  {exp.type === "image" ? <Image className="w-4 h-4 text-cyan-400" /> : exp.type === "audio" ? <Music className="w-4 h-4 text-purple-400" /> : <Video className="w-4 h-4 text-pink-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{exp.name}</div>
                  <div className="text-[10px] text-muted-foreground">{exp.size} · {exp.time}</div>
                </div>
                {exp.status === "completed" ? (
                  <button onClick={() => toast.success("Download started!")} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
