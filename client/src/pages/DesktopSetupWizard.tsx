import React, { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, HardDrive, Sparkles, CheckCircle2, ArrowRight, Download, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function DesktopSetupWizard() {
  const [step, setStep] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState("auto");

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-7">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="genei-card p-8 rounded-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-foreground">Genei AI Desktop — First-Run Setup</h1>
              <p className="text-xs text-muted-foreground">Configuring your embedded local runtime, hardware detection, and workstation pairing.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/30">Step {step} of 3</span>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-foreground">1. Hardware & GPU Auto-Detection</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Cpu className="w-4 h-4 text-cyan-400" /> Processor & System
                </div>
                <p className="text-xs text-muted-foreground">Windows x64 Workstation detected with multi-core CPU architecture and AVX2 instruction support.</p>
              </div>
              <div className="p-4 rounded-xl border border-border bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <HardDrive className="w-4 h-4 text-purple-400" /> Storage & Model Cache
                </div>
                <p className="text-xs text-muted-foreground">Optimized local model cache directory ready for Flux, SDXL, and LLM weights.</p>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <button type="button" onClick={() => setStep(2)} className="genei-button-primary px-5 py-2.5 text-xs flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-foreground">2. Select Execution Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div onClick={() => setSelectedProfile("auto")} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedProfile === "auto" ? "border-primary bg-primary/10" : "border-border bg-black/30"}`}>
                <div className="font-semibold text-xs text-foreground mb-1">Hybrid Local + Cloud</div>
                <p className="text-[11px] text-muted-foreground">Automatically routes heavy video tasks to cloud BYOK APIs and lightweight generations locally.</p>
              </div>
              <div onClick={() => setSelectedProfile("local")} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedProfile === "local" ? "border-primary bg-primary/10" : "border-border bg-black/30"}`}>
                <div className="font-semibold text-xs text-foreground mb-1">Local Hardware Only</div>
                <p className="text-[11px] text-muted-foreground">Runs all models strictly on your laptop GPU/CPU for complete offline privacy.</p>
              </div>
              <div onClick={() => setSelectedProfile("cloud")} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedProfile === "cloud" ? "border-primary bg-primary/10" : "border-border bg-black/30"}`}>
                <div className="font-semibold text-xs text-foreground mb-1">Cloud Gateway Mode</div>
                <p className="text-[11px] text-muted-foreground">Uses managed LLM gateway and saved BYOK API keys for zero hardware load.</p>
              </div>
            </div>
            <div className="flex justify-between pt-3">
              <button type="button" onClick={() => setStep(1)} className="genei-btn-secondary px-4 py-2.5 text-xs">Back</button>
              <button type="button" onClick={() => setStep(3)} className="genei-button-primary px-5 py-2.5 text-xs flex items-center gap-2">
                Complete Setup <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/15 text-green-400 border border-green-500/30 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold font-display text-foreground">Desktop Workspace Ready</h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Your Genei AI desktop application is configured. Embedded hardware pairing, model routing, and creator studios are fully active.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link href="/">
                <button type="button" onClick={() => toast.success("Entering Genei AI workspace")} className="genei-button-primary px-6 py-2.5 text-xs">
                  Launch Creator Workspace
                </button>
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
