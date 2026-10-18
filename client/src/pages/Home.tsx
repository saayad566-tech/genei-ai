import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Archive, ArrowRight, Bot, CheckCircle2, Clock, Code2, Film, Globe, Image, Loader2, Megaphone, Mic, Monitor, Music, Palette, Pen, Play, Smartphone, Sparkles, Trash2, TrendingUp, Users, Video, Wand2, Zap } from "lucide-react";
import { useEffect } from "react";
import { readDesktopStatus, type DesktopStatus } from "@/lib/desktop";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

const quickCreate = [
  { label: "AI Image", icon: Image, path: "/image", color: "oklch(0.72 0.18 210)", gradient: "from-cyan-500/20 to-blue-500/10" },
  { label: "Music Track", icon: Music, path: "/music", color: "oklch(0.65 0.22 285)", gradient: "from-purple-500/20 to-violet-500/10" },
  { label: "Cinematic Video", icon: Video, path: "/video", color: "oklch(0.60 0.25 310)", gradient: "from-pink-500/20 to-rose-500/10" },
  { label: "Voice Clone", icon: Mic, path: "/voice", color: "oklch(0.65 0.22 285)", gradient: "from-purple-500/20 to-indigo-500/10" },
  { label: "Build App", icon: Smartphone, path: "/app-builder", color: "oklch(0.78 0.18 75)", gradient: "from-amber-500/20 to-yellow-500/10" },
  { label: "Website", icon: Globe, path: "/website", color: "oklch(0.68 0.20 155)", gradient: "from-green-500/20 to-emerald-500/10" },
];

const aiAgents = [
  { name: "Music Producer", desc: "Compose beats, melodies & full tracks", icon: Music, color: "oklch(0.65 0.22 285)", path: "/music" },
  { name: "Video Director", desc: "Cinematic videos & reels with AI", icon: Film, color: "oklch(0.60 0.25 310)", path: "/video" },
  { name: "App Developer", desc: "Build apps & SaaS platforms fast", icon: Code2, color: "oklch(0.78 0.18 75)", path: "/app-builder" },
  { name: "UI/UX Designer", desc: "Logos, branding & visual assets", icon: Palette, color: "oklch(0.72 0.18 210)", path: "/image" },
  { name: "Marketing Agent", desc: "Content, ads & social media strategy", icon: Megaphone, color: "oklch(0.68 0.20 155)", path: "/automation" },
  { name: "Story Writer", desc: "Scripts, lyrics & creative writing", icon: Pen, color: "oklch(0.60 0.25 310)", path: "/voice" },
];

const trendingStyles = [
  { label: "Cyberpunk Neon", tag: "image", color: "oklch(0.72 0.18 210)" },
  { label: "Lo-Fi Hip Hop", tag: "music", color: "oklch(0.65 0.22 285)" },
  { label: "Anime Cinematic", tag: "video", color: "oklch(0.60 0.25 310)" },
  { label: "Vaporwave Art", tag: "image", color: "oklch(0.65 0.22 285)" },
  { label: "Trap Beats", tag: "music", color: "oklch(0.78 0.18 75)" },
  { label: "Dark Fantasy", tag: "image", color: "oklch(0.60 0.25 310)" },
  { label: "Afrobeats", tag: "music", color: "oklch(0.68 0.20 155)" },
  { label: "Sci-Fi Short", tag: "video", color: "oklch(0.72 0.18 210)" },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } } };

function MonitorIcon() {
  return <Monitor className="w-4 h-4" />;
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const statsQuery = trpc.stats.overview.useQuery(undefined, { enabled: isAuthenticated });
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.message("Project created", { description: newProjectTitle });
      setNewProjectTitle("");
      setCreatingProject(false);
      void projectsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.message("Project deleted");
      void projectsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const stats = statsQuery.data || { totalAssets: 0, totalProjects: 0, totalApiKeys: 0, totalMessages: 0 };
  const recentProjects = projectsQuery.data?.slice(0, 4) || [];

  useEffect(() => {
    void readDesktopStatus().then(setDesktopStatus).catch(() => setDesktopStatus(null));
  }, []);

  const desktopIsReady = desktopStatus?.hardware?.status === "ready";

  return (
    <div className="p-5 max-w-[1400px] mx-auto space-y-7">
      {/* Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl p-7"
        style={{
          background: "linear-gradient(135deg, oklch(0.12 0.02 285), oklch(0.10 0.015 310), oklch(0.09 0.012 265))",
          border: "1px solid oklch(0.65 0.22 285 / 0.2)",
          boxShadow: "0 0 60px oklch(0.65 0.22 285 / 0.08), inset 0 1px 0 oklch(0.65 0.22 285 / 0.1)",
        }}
      >
        {/* Background orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.65 0.22 285), transparent)" }} />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full opacity-8 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.60 0.25 310), transparent)" }} />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="genei-badge-purple">Ultimate AI Creator Ecosystem</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display mb-2">
              <span className="genei-gradient-text">Create Anything</span>
              <br />
              <span className="text-foreground">with AI Power</span>
            </h1>
            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              Music, videos, images, apps, websites, and automation — all from one intelligent platform.
              {!isAuthenticated && " Sign in to unlock the full creator ecosystem."}
            </p>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {isAuthenticated ? (
              <Link href="/image">
                <motion.button whileTap={{ scale: 0.97 }}
                  className="genei-btn-primary flex items-center gap-2 px-5 py-3 text-sm">
                  <Wand2 className="w-4 h-4" /> Start Creating
                </motion.button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <motion.button whileTap={{ scale: 0.97 }}
                  className="genei-btn-primary flex items-center gap-2 px-5 py-3 text-sm">
                  <Sparkles className="w-4 h-4" /> Get Started Free
                </motion.button>
              </a>
            )}
            <Link href="/marketplace">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/80 transition-all">
                <Play className="w-3.5 h-3.5" /> Explore Templates
              </button>
            </Link>
            <Link
              href="/setup-wizard"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 transition-all"
            >
              <MonitorIcon /> View Desktop Capabilities
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {desktopStatus ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <div>
            <div className="text-xs font-semibold text-foreground">{desktopIsReady ? "Your computer is ready" : desktopStatus?.hardware?.status === "browser-preview" ? "Ready when you install Genei" : "Getting Genei ready"}</div>
            <div className="text-[11px] text-muted-foreground">{desktopStatus?.hardware?.status === "browser-preview" ? "Genei automatically finds the best way to run each creation." : desktopStatus?.hardware?.message || "Genei automatically chooses the best way to power each tool."}</div>
          </div>
        </div>
        <Link href="/byoh" className="text-xs font-semibold text-primary hover:underline">See how it works →</Link>
      </div>

      {/* Stats */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Assets Created", value: stats.totalAssets, icon: Archive, color: "oklch(0.72 0.18 210)" },
          { label: "Projects", value: stats.totalProjects, icon: Sparkles, color: "oklch(0.65 0.22 285)" },
          { label: "API Keys", value: stats.totalApiKeys, icon: Zap, color: "oklch(0.78 0.18 75)" },
          { label: "AI Messages", value: stats.totalMessages, icon: Bot, color: "oklch(0.60 0.25 310)" },
        ].map((stat) => (
          <motion.div key={stat.label} variants={item} className="genei-card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${stat.color} / 0.15` }}>
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-2xl font-bold font-display text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Create */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display text-foreground">Quick Create</h2>
          <span className="text-xs text-muted-foreground">Pick a studio to start</span>
        </div>
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickCreate.map((item_) => (
            <motion.div key={item_.label} variants={item}>
              <Link href={item_.path}>
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                  className="genei-card p-4 rounded-xl flex flex-col items-center gap-3 cursor-pointer hover:border-primary/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105"
                    style={{ background: `${item_.color} / 0.15` }}>
                    <item_.icon className="w-6 h-6" style={{ color: item_.color }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground text-center">{item_.label}</span>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* AI Agents */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-display text-foreground">AI Agents</h2>
            <span className="genei-badge-purple">6 Agents Active</span>
          </div>
          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aiAgents.map((agent) => (
              <motion.div key={agent.name} variants={item}>
                <Link href={agent.path}>
                  <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
                    className="genei-card p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-primary/30 transition-all group">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${agent.color} / 0.15` }}>
                      <agent.icon className="w-5 h-5" style={{ color: agent.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent.desc}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Recent Projects + Trending */}
        <div className="space-y-5">
          {/* Recent Projects */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold font-display text-foreground">Recent Projects</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setCreatingProject((open) => !open)}
                >
                  {creatingProject ? "Cancel" : "New project"}
                </button>
                <Link href="/assets">
                  <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
                </Link>
              </div>
            </div>
            {creatingProject ? (
              <div className="genei-card mb-3 flex flex-wrap gap-2 rounded-xl p-3">
                <input
                  className="genei-input min-w-0 flex-1 text-sm"
                  placeholder="Project title"
                  value={newProjectTitle}
                  onChange={(event) => setNewProjectTitle(event.target.value)}
                />
                <button
                  type="button"
                  className="gx-cta"
                  disabled={createProject.isPending || !newProjectTitle.trim()}
                  onClick={() => createProject.mutate({ title: newProjectTitle.trim(), type: "video" })}
                >
                  {createProject.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            ) : null}
            <div className="genei-card rounded-xl overflow-hidden">
              {recentProjects.length === 0 ? (
                <div className="p-6 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">No projects yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Start creating to see your work here</p>
                </div>
              ) : (
                recentProjects.map((proj, i) => (
                  <div key={proj.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors ${i < recentProjects.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "oklch(0.65 0.22 285 / 0.15)" }}>
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{proj.title}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{proj.type}</div>
                    </div>
                    <button
                      type="button"
                      className="flex-shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                      aria-label={`Delete ${proj.title}`}
                      onClick={() => {
                        // Deleting a project cannot be undone, so it is confirmed first.
                        if (window.confirm(`Delete "${proj.title}"? This cannot be undone.`)) {
                          deleteProject.mutate({ id: proj.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${proj.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                      {proj.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Trending Styles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold font-display text-foreground">Trending Styles</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {trendingStyles.map((style) => (
                <motion.button key={style.label} whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-primary/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                  style={{ background: "oklch(0.13 0.015 265)" }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: style.color }} />
                  {style.label}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
