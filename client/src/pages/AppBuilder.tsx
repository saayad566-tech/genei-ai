import React, { useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Wand2, Code2, Database, Lock, CreditCard, Globe, Zap, Download, Play, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const frameworks = [
  { id: "react-native", label: "React Native", desc: "Cross-platform mobile", icon: "⚛️", color: "oklch(0.72 0.18 210)" },
  { id: "flutter", label: "Flutter", desc: "Google's UI toolkit", icon: "🐦", color: "oklch(0.65 0.22 285)" },
  { id: "nextjs", label: "Next.js", desc: "Full-stack web app", icon: "▲", color: "oklch(0.60 0.25 310)" },
];

const features = [
  { id: "auth", label: "Authentication", icon: Lock, desc: "Login, signup, OAuth" },
  { id: "db", label: "Database", icon: Database, desc: "Auto-generated schema" },
  { id: "payments", label: "Stripe Payments", icon: CreditCard, desc: "Subscriptions & one-time" },
  { id: "api", label: "REST API", icon: Code2, desc: "Auto-generated endpoints" },
  { id: "pwa", label: "PWA Support", icon: Globe, desc: "Installable web app" },
  { id: "push", label: "Push Notifications", icon: Zap, desc: "Real-time alerts" },
];

const appTemplates = [
  { name: "SaaS Starter", desc: "Auth + billing + dashboard", icon: "🚀", color: "oklch(0.65 0.22 285)" },
  { name: "E-Commerce", desc: "Store + cart + payments", icon: "🛒", color: "oklch(0.60 0.25 310)" },
  { name: "Social App", desc: "Feed + profiles + DMs", icon: "💬", color: "oklch(0.72 0.18 210)" },
  { name: "AI Chatbot", desc: "LLM-powered assistant", icon: "🤖", color: "oklch(0.78 0.18 75)" },
  { name: "Portfolio", desc: "Showcase + contact", icon: "🎨", color: "oklch(0.68 0.20 155)" },
  { name: "Blog Platform", desc: "CMS + SEO + analytics", icon: "📝", color: "oklch(0.65 0.22 285)" },
];

export default function AppBuilder() {
  const [prompt, setPrompt] = useState("");
  const [framework, setFramework] = useState("nextjs");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(["auth", "db"]);
  const [appName, setAppName] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generateTextMutation = trpc.ai.generateText.useMutation();

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the app you want to build first");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateTextMutation.mutateAsync({
        purpose: "prompt",
        prompt: `Create a production-ready app blueprint for ${appName.trim() || "an untitled app"}. Requirements: ${prompt.trim()}. Framework: ${framework}. Include these features: ${selectedFeatures.join(", ") || "none"}. Return concise sections for architecture, screens, data model, API surface, and next implementation steps. Do not claim to have built or packaged a native binary.`,
      });
      setGeneratedSpec(result.content);
      toast.success("App blueprint generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "App blueprint generation failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportSource = () => {
    const sourcePackage = {
      name: appName.trim() || "Genei App Blueprint",
      framework,
      features: selectedFeatures,
      requirements: prompt.trim(),
      blueprint: generatedSpec,
      note: "This is a source blueprint. Native APK/IPA packaging requires a genuine platform build and installation validation.",
    };
    const blob = new Blob([JSON.stringify(sourcePackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(appName.trim() || "genei-app").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-source.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Source blueprint exported");
  };

  const handleTemplateSelect = (templateName: string, description: string) => {
    setAppName(templateName);
    setPrompt(`A ${description.toLowerCase()} with a polished mobile-first interface and production-ready setup.`);
    toast.success(`${templateName} template loaded`);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.78 0.18 75), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.78 0.18 75 / 0.4)" }}>
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text-gold">App Builder</h1>
          <p className="text-xs text-muted-foreground">Prompt-to-app blueprint builder</p>
          <span className="mt-2 inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Live: AI blueprint generation · Preview: build, hosting, APK/IPA packaging</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-5">
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">App Name</label>
              <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="My Awesome App" className="w-full genei-input" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Describe your app</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A SaaS platform for freelancers to manage clients, invoices, and projects with AI-powered insights and Stripe billing..."
                rows={4} className="w-full genei-input resize-none" />
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-3 block">Framework</label>
              <div className="grid grid-cols-3 gap-3">
                {frameworks.map((fw) => (
                  <button key={fw.id} onClick={() => setFramework(fw.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${framework === fw.id ? "border-primary/50" : "border-border hover:border-border/80"}`}
                    style={framework === fw.id ? { background: `${fw.color} / 0.12` } : { background: "oklch(0.13 0.015 265)" }}>
                    <div className="text-2xl mb-2">{fw.icon}</div>
                    <div className="text-sm font-semibold text-foreground">{fw.label}</div>
                    <div className="text-xs text-muted-foreground">{fw.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-3 block">Features</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {features.map((feat) => (
                  <button key={feat.id} onClick={() => toggleFeature(feat.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${selectedFeatures.includes(feat.id) ? "border-primary/50 bg-primary/10" : "border-border hover:border-border/80"}`}
                    style={{ background: selectedFeatures.includes(feat.id) ? "oklch(0.65 0.22 285 / 0.12)" : "oklch(0.13 0.015 265)" }}>
                    <feat.icon className={`w-4 h-4 flex-shrink-0 ${selectedFeatures.includes(feat.id) ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className={`text-xs font-medium ${selectedFeatures.includes(feat.id) ? "text-foreground" : "text-muted-foreground"}`}>{feat.label}</div>
                      <div className="text-[10px] text-muted-foreground">{feat.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => void handleGenerate()} disabled={isGenerating || !prompt.trim()}
                className="flex-1 genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Wand2 className="w-4 h-4" /> {isGenerating ? "Generating..." : "Generate Blueprint"}
              </motion.button>
              <button onClick={handleExportSource}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all" title="Downloads the blueprint JSON; it does not build an APK, IPA, or deployed app.">
                <Download className="w-4 h-4" /> Export source JSON
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground font-display">App Templates</h3>
            {appTemplates.map((tmpl) => (
              <div key={tmpl.name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 cursor-pointer transition-colors group"
                                  onClick={() => handleTemplateSelect(tmpl.name, tmpl.desc)}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: `${tmpl.color} / 0.15` }}>{tmpl.icon}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{tmpl.name}</div>
                  <div className="text-xs text-muted-foreground">{tmpl.desc}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            ))}
          </div>

          <div className="genei-card p-5 rounded-xl">
            <h3 className="font-semibold text-foreground font-display">Blueprint Preview</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">This is an implementation plan generated by the AI gateway. A real build, hosting target, and native package still require a connected build pipeline.</p>
            <div className="aspect-[9/16] rounded-2xl border-2 border-border flex items-center justify-center max-w-[160px] mx-auto"
              style={{ background: "oklch(0.09 0.01 265)" }}>
              <div className="text-center">
                <Smartphone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground">{generatedSpec ? "Blueprint ready" : "Generate a blueprint"}</p>
              </div>
            </div>
            {generatedSpec && (
              <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-[10px] leading-4 text-muted-foreground">{generatedSpec}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
