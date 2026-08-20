import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key, Plus, Trash2, Check, X, Shield,
  Activity, DollarSign, ChevronDown, Loader2, Edit2, Zap, Monitor, Copy
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ModelRuntimeStatus } from "@/components/ModelRuntimeStatus";
import { ByohMonitorPanel } from "@/components/ByohMonitorPanel";

const providers = [
  { id: "openai", name: "OpenAI", desc: "GPT-4, DALL·E, Whisper", category: "AI", color: "oklch(0.68 0.20 155)", icon: "🤖" },
  { id: "suno", name: "Suno", desc: "AI music generation", category: "Music", color: "oklch(0.65 0.22 285)", icon: "🎵" },
  { id: "udio", name: "Udio", desc: "High-quality AI songs", category: "Music", color: "oklch(0.60 0.25 310)", icon: "🎶" },
  { id: "elevenlabs", name: "ElevenLabs", desc: "Voice cloning & TTS", category: "Voice", color: "oklch(0.72 0.18 210)", icon: "🎤" },
  { id: "runway", name: "Runway", desc: "Gen-3 video generation", category: "Video", color: "oklch(0.65 0.22 285)", icon: "🎬" },
  { id: "pika", name: "Pika", desc: "Text-to-video AI", category: "Video", color: "oklch(0.60 0.25 310)", icon: "📹" },
  { id: "kling", name: "Kling", desc: "Cinematic AI video", category: "Video", color: "oklch(0.72 0.18 210)", icon: "🎥" },
  { id: "heygen", name: "HeyGen", desc: "AI avatars & lip sync", category: "Video", color: "oklch(0.78 0.18 75)", icon: "👤" },
  { id: "midjourney", name: "Midjourney", desc: "Artistic AI images", category: "Image", color: "oklch(0.65 0.22 285)", icon: "🎨" },
  { id: "flux", name: "Flux", desc: "Fast image generation", category: "Image", color: "oklch(0.60 0.25 310)", icon: "⚡" },
  { id: "stable-diffusion", name: "Stable Diffusion", desc: "Open-source AI art", category: "Image", color: "oklch(0.72 0.18 210)", icon: "🖼️" },
  { id: "anthropic", name: "Anthropic", desc: "Claude AI models", category: "AI", color: "oklch(0.78 0.18 75)", icon: "🧠" },
];

const categories = ["All", "AI", "Music", "Video", "Image", "Voice"];

export function runnerCapabilitySummary(value: string | null) {
  if (!value) return "No capabilities reported";
  try {
    const parsed = JSON.parse(value) as { tools?: string[]; hardware?: { gpu_count?: number; ram_mb?: number | null } };
    if (Array.isArray(parsed)) return `${parsed.length} capabilities`;
    const tools = parsed.tools?.length ?? 0;
    const gpuCount = parsed.hardware?.gpu_count ?? 0;
    const ram = parsed.hardware?.ram_mb ? ` · ${Math.round(parsed.hardware.ram_mb / 1024)} GB RAM` : "";
    return `${tools} tools · ${gpuCount} GPU${gpuCount === 1 ? "" : "s"}${ram}`;
  } catch {
    return "Capability metadata unavailable";
  }
}

export default function ApiIntegrations() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [healthByKey, setHealthByKey] = useState<Record<number, { status: string; message: string }>>({});
  const [runnerName, setRunnerName] = useState("");
  const [runnerPlatform, setRunnerPlatform] = useState("Windows");
  const [pairedToken, setPairedToken] = useState<string | null>(null);

  const { data: apiKeys, refetch } = trpc.apiKeys.list.useQuery();
  const addKeyMutation = trpc.apiKeys.add.useMutation({
    onSuccess: () => { refetch(); setAddingProvider(null); setNewKey(""); setNewLabel(""); toast.success("API key added securely!"); },
    onError: (err) => toast.error(err.message || "Failed to add key"),
  });
  const deleteKeyMutation = trpc.apiKeys.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("API key removed"); },
  });
  const toggleKeyMutation = trpc.apiKeys.toggle.useMutation({
    onSuccess: () => refetch(),
  });
  const { data: runners, refetch: refetchRunners } = trpc.runners.list.useQuery();
  const pairRunnerMutation = trpc.runners.pair.useMutation({
    onSuccess: (result) => { setPairedToken(result.token); setRunnerName(""); refetchRunners(); toast.success("BYOH runner paired. Copy the token into the runner once."); },
    onError: (error) => toast.error(error.message || "Unable to pair runner"),
  });
  const revokeRunnerMutation = trpc.runners.revoke.useMutation({
    onSuccess: () => { refetchRunners(); toast.success("Runner revoked"); },
  });
  const healthCheckMutation = trpc.apiKeys.healthCheck.useMutation({
    onSuccess: (result, variables) => {
      setHealthByKey((previous) => ({ ...previous, [variables.id]: result }));
      toast[result.status === "healthy" ? "success" : "warning"](result.message);
    },
    onError: (error) => toast.error(error.message || "Provider health check failed"),
  });

  const filteredProviders = providers.filter(p =>
    activeCategory === "All" || p.category === activeCategory
  );

  const getKeyForProvider = (providerId: string) =>
    apiKeys?.find(k => k.provider === providerId);

  const handleAddKey = () => {
    if (!newKey.trim() || !addingProvider) { toast.error("Enter an API key"); return; }
    addKeyMutation.mutate({ provider: addingProvider, key: newKey, label: newLabel || undefined });
  };

  const totalUsage = apiKeys?.reduce((acc, k) => acc + k.usageCount, 0) ?? 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.78 0.18 75))", boxShadow: "0 0 20px oklch(0.65 0.22 285 / 0.4)" }}>
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display genei-gradient-text">API Integrations</h1>
            <p className="text-xs text-muted-foreground">Manage your AI service connections</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="genei-card px-4 py-2 rounded-xl flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground font-medium">{totalUsage.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">total calls</span>
          </div>
          <div className="genei-card px-4 py-2 rounded-xl flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Encrypted at rest</span>
          </div>
        </div>
      </div>

      <ModelRuntimeStatus />

      <div className="genei-card rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15"><Monitor className="h-5 w-5 text-primary" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground font-display">Bring Your Own Hardware</h2>
            <p className="text-xs text-muted-foreground">Pair a workstation to run heavy video, image, audio, and upscaling tools locally. The runner connects outbound and never receives provider secrets.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
          <input value={runnerName} onChange={(event) => setRunnerName(event.target.value)} placeholder="Workstation name" className="genei-input text-sm" />
          <select value={runnerPlatform} onChange={(event) => setRunnerPlatform(event.target.value)} className="genei-input text-sm">
            <option>Windows</option><option>macOS</option><option>Linux</option>
          </select>
          <button type="button" disabled={!runnerName.trim() || pairRunnerMutation.isPending} onClick={() => pairRunnerMutation.mutate({ name: runnerName.trim(), platform: runnerPlatform })} className="genei-btn-primary min-h-11 px-4 text-sm disabled:opacity-50">{pairRunnerMutation.isPending ? "Pairing..." : "Pair workstation"}</button>
        </div>
        {pairedToken && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs font-semibold text-foreground">Copy this one-time runner token</div>
            <div className="mt-2 flex gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-primary">{pairedToken}</code>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(pairedToken); toast.success("Runner token copied"); }} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="Copy runner token"><Copy className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Keep this token private. The runner will report its installed tools and GPU capabilities after its first heartbeat.</p>
          </div>
        )}
        <div className="space-y-6 pt-2">
          <div className="rounded-lg bg-black/40 border border-border p-3 font-mono text-[11px] text-primary flex items-center justify-between">
            <span>python -m ai_director.runner_installer --server-url {window.location.origin} --token YOUR_TOKEN</span>
          </div>
          <ByohMonitorPanel />
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeCategory === cat ? "text-white" : "border border-border text-muted-foreground hover:text-foreground"}`}
            style={activeCategory === cat ? { background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" } : {}}>
            {cat}
          </button>
        ))}
      </div>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProviders.map((provider) => {
          const existingKey = getKeyForProvider(provider.id);
          const isAdding = addingProvider === provider.id;

          return (
            <motion.div key={provider.id} layout className="genei-card rounded-xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: `${provider.color} / 0.15`, border: `1px solid ${provider.color} / 0.25` }}>
                      {provider.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{provider.name}</div>
                      <div className="text-xs text-muted-foreground">{provider.desc}</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{provider.category}</span>
                </div>

                {existingKey ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
                      <Shield className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground flex-1 font-mono">
                        Key stored securely · never exposed to the browser
                      </span>
                    </div>
                    {healthByKey[existingKey.id] && (
                      <div className={`rounded-lg px-2.5 py-2 text-[10px] ${healthByKey[existingKey.id].status === "healthy" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-300"}`}>
                        {healthByKey[existingKey.id].message}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" /> {existingKey.usageCount} calls
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => healthCheckMutation.mutate({ id: existingKey.id })} disabled={healthCheckMutation.isPending}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-all">
                          {healthCheckMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Test
                        </button>
                        <button onClick={() => toggleKeyMutation.mutate({ id: existingKey.id })}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${existingKey.isActive ? "bg-green-500/20 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                          {existingKey.isActive ? "Active" : "Inactive"}
                        </button>
                        <button onClick={() => deleteKeyMutation.mutate({ id: existingKey.id })}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : isAdding ? (
                  <AnimatePresence>
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                      <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Label (optional)" className="w-full genei-input text-xs py-2" />
                      <input value={newKey} onChange={(e) => setNewKey(e.target.value)}
                        placeholder={`Enter ${provider.name} API key...`} type="password" className="w-full genei-input text-xs py-2 font-mono" />
                      <div className="flex gap-2">
                        <button onClick={handleAddKey} disabled={addKeyMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white transition-all"
                          style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                          {addKeyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Save Key
                        </button>
                        <button onClick={() => { setAddingProvider(null); setNewKey(""); setNewLabel(""); }}
                          className="px-3 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <button onClick={() => setAddingProvider(provider.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all">
                    <Plus className="w-3.5 h-3.5" /> Connect {provider.name}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Usage & Cost */}
      <div className="genei-card p-5 rounded-xl">
        <h3 className="font-semibold text-foreground font-display mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" /> Usage & Cost Estimation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "This Month", value: "$0.00", desc: "API costs", color: "oklch(0.68 0.20 155)" },
            { label: "API Calls", value: totalUsage.toString(), desc: "Total requests", color: "oklch(0.72 0.18 210)" },
            { label: "Connected APIs", value: (apiKeys?.length ?? 0).toString(), desc: "Active integrations", color: "oklch(0.65 0.22 285)" },
          ].map((stat) => (
            <div key={stat.label} className="p-4 rounded-xl" style={{ background: "oklch(0.14 0.02 265)" }}>
              <div className="text-2xl font-bold font-display" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-sm font-medium text-foreground mt-1">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
