import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Star, Download, Search, Filter, Flame, ChevronRight, Heart } from "lucide-react";
import { toast } from "sonner";

const categories = ["All", "Music", "Video", "Image", "App", "Website", "Voice", "Automation"];

const templates = [
  { id: 1, name: "Cyberpunk Music Pack", category: "Music", rating: 4.9, downloads: "12.4K", price: "Free", author: "ProducerX", tags: ["Hip-Hop", "Electronic"], hot: true, color: "oklch(0.65 0.22 285)" },
  { id: 2, name: "Cinematic Video Preset", category: "Video", rating: 4.8, downloads: "8.2K", price: "$9.99", author: "FilmAI", tags: ["Cinematic", "4K"], hot: true, color: "oklch(0.60 0.25 310)" },
  { id: 3, name: "Neon Art Style Pack", category: "Image", rating: 4.7, downloads: "21K", price: "Free", author: "ArtGen", tags: ["Neon", "Cyberpunk"], hot: false, color: "oklch(0.72 0.18 210)" },
  { id: 4, name: "SaaS Landing Template", category: "Website", rating: 4.9, downloads: "5.6K", price: "$19.99", author: "WebAI", tags: ["SaaS", "Dark"], hot: true, color: "oklch(0.78 0.18 75)" },
  { id: 5, name: "Voice Clone Pack", category: "Voice", rating: 4.6, downloads: "3.1K", price: "$14.99", author: "VoiceAI", tags: ["TTS", "Clone"], hot: false, color: "oklch(0.68 0.20 155)" },
  { id: 6, name: "Social Media Automation", category: "Automation", rating: 4.8, downloads: "9.7K", price: "Free", author: "AutoBot", tags: ["Instagram", "TikTok"], hot: true, color: "oklch(0.65 0.22 285)" },
  { id: 7, name: "Album Cover Generator", category: "Image", rating: 4.7, downloads: "15K", price: "Free", author: "CoverAI", tags: ["Music", "Art"], hot: false, color: "oklch(0.60 0.25 310)" },
  { id: 8, name: "Podcast Intro Pack", category: "Music", rating: 4.5, downloads: "6.3K", price: "$4.99", author: "SoundAI", tags: ["Podcast", "Jingle"], hot: false, color: "oklch(0.72 0.18 210)" },
];

export default function Marketplace() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [likedItems, setLikedItems] = useState<number[]>([]);

  const filtered = templates.filter(t =>
    (activeCategory === "All" || t.category === activeCategory) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())))
  );

  const toggleLike = (id: number) => {
    setLikedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.78 0.18 75), oklch(0.68 0.20 155))", boxShadow: "0 0 20px oklch(0.78 0.18 75 / 0.4)" }}>
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display genei-gradient-text-gold">Marketplace</h1>
            <p className="text-xs text-muted-foreground">Templates, presets & AI packs</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..."
              className="pl-9 pr-4 py-2 genei-input text-sm w-64" />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-all">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeCategory === cat ? "text-white" : "border border-border text-muted-foreground hover:text-foreground"}`}
            style={activeCategory === cat ? { background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" } : {}}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((tmpl, i) => (
          <motion.div key={tmpl.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className="genei-card rounded-xl overflow-hidden hover:border-primary/30 transition-all group cursor-pointer">
              <div className="aspect-video relative flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${tmpl.color} / 0.2, oklch(0.10 0.01 265))` }}>
                {tmpl.hot && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 genei-badge-pink text-[10px]">
                    <Flame className="w-2.5 h-2.5" /> Hot
                  </div>
                )}
                <div className="text-4xl">{tmpl.category === "Music" ? "🎵" : tmpl.category === "Video" ? "🎬" : tmpl.category === "Image" ? "🎨" : tmpl.category === "Website" ? "🌐" : tmpl.category === "Voice" ? "🎤" : "⚡"}</div>
                <button onClick={(e) => { e.stopPropagation(); toggleLike(tmpl.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 transition-colors">
                  <Heart className={`w-3.5 h-3.5 ${likedItems.includes(tmpl.id) ? "text-red-400 fill-red-400" : "text-white"}`} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{tmpl.name}</h3>
                  <span className={`text-xs font-bold ${tmpl.price === "Free" ? "text-green-400" : "text-foreground"}`}>{tmpl.price}</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <Star className="w-3 h-3 fill-yellow-400" /> {tmpl.rating}
                  </div>
                  <span className="text-xs text-muted-foreground">·</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Download className="w-3 h-3" /> {tmpl.downloads}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {tmpl.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{tag}</span>
                  ))}
                </div>
                <button onClick={() => toast.success(`${tmpl.name} ${tmpl.price === "Free" ? "downloaded" : "added to cart"}!`)}
                  className="w-full py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285 / 0.2), oklch(0.60 0.25 310 / 0.2))", border: "1px solid oklch(0.65 0.22 285 / 0.3)", color: "oklch(0.80 0.18 285)" }}>
                  {tmpl.price === "Free" ? "Download Free" : `Buy ${tmpl.price}`}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
