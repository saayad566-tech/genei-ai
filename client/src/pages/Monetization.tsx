import { useState } from "react";
import React from "react";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Users, Star, CreditCard, Zap, Globe, ShoppingBag, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const plans = [
  { name: "Starter", price: "$0", period: "/mo", features: ["5 AI images/day", "10 music tracks/mo", "Basic templates", "1GB storage"], color: "oklch(0.65 0.22 285)", current: false },
  { name: "Creator", price: "$29", period: "/mo", features: ["Unlimited images", "100 music tracks/mo", "All templates", "50GB storage", "API access", "Priority support"], color: "oklch(0.60 0.25 310)", current: true, popular: true },
  { name: "Studio", price: "$99", period: "/mo", features: ["Everything in Creator", "Unlimited storage", "Team workspace (5)", "Custom domain", "White-label", "Dedicated support"], color: "oklch(0.78 0.18 75)", current: false },
];

const revenueStreams = [
  { name: "Sell AI Creations", desc: "Sell your generated music, images, and videos", icon: ShoppingBag, color: "oklch(0.65 0.22 285)" },
  { name: "Template Marketplace", desc: "Publish and sell your templates", icon: Star, color: "oklch(0.60 0.25 310)" },
  { name: "API Reselling", desc: "Resell AI capabilities to your clients", icon: Zap, color: "oklch(0.72 0.18 210)" },
  { name: "White-Label Platform", desc: "Brand Genei AI as your own product", icon: Globe, color: "oklch(0.78 0.18 75)" },
];

export default function Monetization() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.78 0.18 75), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.78 0.18 75 / 0.4)" }}>
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text-gold">Monetization</h1>
          <p className="text-xs text-muted-foreground">Turn your creations into revenue</p>
          <span className="mt-2 inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Preview — billing and payout data not connected</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Workspace revenue", value: "—", icon: DollarSign, color: "oklch(0.78 0.18 75)" },
          { label: "Growth data", value: "—", icon: TrendingUp, color: "oklch(0.68 0.20 155)" },
          { label: "Customer data", value: "—", icon: Users, color: "oklch(0.72 0.18 210)" },
          { label: "Sales data", value: "—", icon: ShoppingBag, color: "oklch(0.65 0.22 285)" },
        ].map((stat) => (
          <div key={stat.label} className="genei-card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${stat.color} / 0.15` }}>
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-xl font-bold font-display text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Plans */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold font-display text-foreground">Subscription Plans</h2><span className="text-[11px] text-muted-foreground">Example pricing — connect billing in Settings before purchasing.</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.name} className={`genei-card rounded-xl overflow-hidden relative ${plan.current ? "border-primary/50" : ""}`}
              style={plan.current ? { boxShadow: "0 0 30px oklch(0.65 0.22 285 / 0.2)" } : {}}>
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${plan.color}, oklch(0.65 0.22 285))` }} />
              )}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-bold text-foreground font-display">{plan.name}</div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold" style={{ color: plan.color }}>{plan.price}</span>
                      <span className="text-xs text-muted-foreground">{plan.period}</span>
                    </div>
                  </div>
                  {plan.popular && <span className="genei-badge-purple text-xs">Popular</span>}
                  {plan.current && <span className="text-xs px-2 py-1 rounded-lg bg-amber-400/10 text-amber-200">Preview selection</span>}
                </div>
                <ul className="space-y-2 mb-5">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${plan.color} / 0.2` }}>
                        <span style={{ color: plan.color, fontSize: "8px" }}>✓</span>
                      </div>
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => toast.info("Billing is not connected", { description: "Review the example plan, then connect a real billing provider in Settings before purchasing." })}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${plan.current ? "border border-border text-muted-foreground" : "text-white"}`}
                  style={!plan.current ? { background: `linear-gradient(135deg, ${plan.color}, oklch(0.65 0.22 285))` } : {}}>
                  {plan.current ? "Preview Plan" : "View plan setup"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Streams */}
      <div>
        <h2 className="text-lg font-bold font-display text-foreground mb-4">Revenue Streams</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {revenueStreams.map((stream) => (
            <div key={stream.name} className="genei-card p-5 rounded-xl flex items-center gap-4 hover:border-primary/30 cursor-pointer transition-all group"
              onClick={() => toast.info(`${stream.name}: configure this revenue stream after connecting the required provider`)}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${stream.color} / 0.15` }}>
                <stream.icon className="w-6 h-6" style={{ color: stream.color }} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">{stream.name}</div>
                <div className="text-xs text-muted-foreground">{stream.desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
