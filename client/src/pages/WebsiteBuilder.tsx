import React, { useState } from "react";
import { motion } from "framer-motion";
import { Globe, Wand2, Search, Smartphone, Download, Eye, Layout } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const websiteTypes = [
  { id: "landing", label: "Landing Page", icon: "🚀" },
  { id: "portfolio", label: "Portfolio", icon: "🎨" },
  { id: "ecommerce", label: "E-Commerce", icon: "🛒" },
  { id: "blog", label: "Blog", icon: "📝" },
  { id: "saas", label: "SaaS", icon: "⚡" },
  { id: "agency", label: "Agency", icon: "🏢" },
];

const templates = [
  { name: "Neon Dark", type: "SaaS", preview: "oklch(0.65 0.22 285)" },
  { name: "Minimal White", type: "Portfolio", preview: "oklch(0.72 0.18 210)" },
  { name: "Cyber Grid", type: "Agency", preview: "oklch(0.60 0.25 310)" },
  { name: "Aurora", type: "Landing", preview: "oklch(0.68 0.20 155)" },
  { name: "Obsidian", type: "Blog", preview: "oklch(0.78 0.18 75)" },
  { name: "Flux", type: "E-Commerce", preview: "oklch(0.65 0.22 285)" },
];

export default function WebsiteBuilder() {
  const [prompt, setPrompt] = useState("");
  const [siteType, setSiteType] = useState("landing");
  const [seoEnabled, setSeoEnabled] = useState(true);
  const [responsiveEnabled, setResponsiveEnabled] = useState(true);
  const [generatedSpec, setGeneratedSpec] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const generateTextMutation = trpc.ai.generateText.useMutation();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the website you want to build first");
      return;
    }
    setIsGenerating(true);
    setPreviewOpen(false);
    try {
      const selectedType = websiteTypes.find((type) => type.id === siteType)?.label || "Website";
      const result = await generateTextMutation.mutateAsync({
        purpose: "prompt",
        prompt: `Create a production-ready ${selectedType} website blueprint. Requirements: ${prompt.trim()}. SEO optimization: ${seoEnabled ? "enabled" : "disabled"}. Responsive mobile-first layout: ${responsiveEnabled ? "enabled" : "disabled"}. Return concise sections for page structure, visual direction, SEO plan, responsive behavior, and implementation steps. Do not claim to have deployed a site.`,
      });
      setGeneratedSpec(result.content);
      toast.success("Website blueprint generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website blueprint generation failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = () => {
    if (!generatedSpec) {
      toast.info("Generate a website blueprint first");
      return;
    }
    setPreviewOpen((open) => !open);
  };

  const handleTemplateSelect = (templateName: string, type: string) => {
    const matchedType = websiteTypes.find((entry) => entry.label.toLowerCase() === type.toLowerCase());
    if (matchedType) setSiteType(matchedType.id);
    setPrompt(`A ${type.toLowerCase()} website using the ${templateName} visual direction, with a polished mobile-first experience.`);
    toast.success(`${templateName} template loaded`);
  };

  const handleExportSource = () => {
    const sourcePackage = {
      type: websiteTypes.find((entry) => entry.id === siteType)?.label || "Website",
      requirements: prompt.trim(),
      seoEnabled,
      responsiveEnabled,
      blueprint: generatedSpec,
      note: "This is a source blueprint. Deployment requires a genuine build and hosting step.",
    };
    const blob = new Blob([JSON.stringify(sourcePackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "genei-website-source.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Website source blueprint exported");
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.68 0.20 155), oklch(0.72 0.18 210))", boxShadow: "0 0 20px oklch(0.68 0.20 155 / 0.4)" }}>
          <Globe className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ background: "linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.72 0.18 210))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Website Builder</h1>
          <p className="text-xs text-muted-foreground">AI-powered website blueprint creation</p>
          <span className="mt-2 inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Live: AI blueprint generation · Preview: deployment and hosting</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-5">
            <div>
              <label className="text-sm font-semibold text-foreground mb-3 block">Website Type</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {websiteTypes.map((type) => (
                  <button key={type.id} type="button" onClick={() => setSiteType(type.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${siteType === type.id ? "border-primary/50 bg-primary/10" : "border-border hover:border-border/80"}`}
                    style={{ background: siteType === type.id ? "oklch(0.65 0.22 285 / 0.12)" : "oklch(0.13 0.015 265)" }}>
                    <span className="text-xl">{type.icon}</span>
                    <span className={`text-[10px] font-medium ${siteType === type.id ? "text-foreground" : "text-muted-foreground"}`}>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Describe your website</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A modern SaaS landing page for an AI writing tool, dark theme, with pricing section and animated hero..."
                rows={4} className="w-full genei-input resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "SEO Optimization", desc: "Meta tags, sitemap, schema", value: seoEnabled, set: setSeoEnabled, icon: Search },
                { label: "Responsive Design", desc: "Mobile-first layout", value: responsiveEnabled, set: setResponsiveEnabled, icon: Smartphone },
              ].map((toggle) => (
                <div key={toggle.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
                  <div className="flex items-center gap-2">
                    <toggle.icon className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-xs font-medium text-foreground">{toggle.label}</div>
                      <div className="text-[10px] text-muted-foreground">{toggle.desc}</div>
                    </div>
                  </div>
                  <button type="button" aria-label={`Toggle ${toggle.label}`} onClick={() => toggle.set(!toggle.value)}
                    className={`w-9 h-5 rounded-full transition-all duration-200 relative ${toggle.value ? "bg-primary" : "bg-secondary"}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${toggle.value ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => void handleGenerate()} disabled={isGenerating || !prompt.trim()}
                className="min-h-11 flex-1 genei-btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Wand2 className="w-4 h-4" /> {isGenerating ? "Generating..." : "Generate Blueprint"}
              </motion.button>
              <button type="button" onClick={handlePreview}
                className="min-h-11 flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                <Eye className="w-4 h-4" /> {previewOpen ? "Hide blueprint" : "Preview blueprint"}
              </button>
              <button type="button" onClick={handleExportSource}
                className="min-h-11 flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                <Download className="w-4 h-4" /> Export source JSON
              </button>
            </div>

            {previewOpen && generatedSpec && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" aria-live="polite">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Eye className="h-4 w-4 text-primary" /> Blueprint preview</div>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">This preview is a generated implementation plan, not a deployed site. Use Export source JSON for the handoff to a real build and hosting step.</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{generatedSpec}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl">
            <h3 className="font-semibold text-foreground font-display mb-4">Templates</h3>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((tmpl) => (
                <button type="button" key={tmpl.name} className="text-left rounded-xl overflow-hidden border border-border hover:border-primary/40 cursor-pointer transition-all group"
                  onClick={() => handleTemplateSelect(tmpl.name, tmpl.type)}>
                  <div className="aspect-video" style={{ background: `linear-gradient(135deg, ${tmpl.preview} / 0.3, oklch(0.10 0.01 265))` }}>
                    <div className="w-full h-full flex items-center justify-center">
                      <Layout className="w-6 h-6 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-medium text-foreground">{tmpl.name}</div>
                    <div className="text-[10px] text-muted-foreground">{tmpl.type}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
