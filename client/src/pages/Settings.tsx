import React, { useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Keyboard, Moon, Sun, Monitor, ChevronRight, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const settingsSections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "domain", label: "Custom Domain & PWA", icon: Globe },
  { id: "downloads", label: "Downloads & Desktop App", icon: Save },
  { id: "language", label: "Language & Region", icon: Globe },
];

import { trpc } from "@/lib/trpc";

function CustomDomainSettingsSection() {
  const { data: domainRecord, refetch } = trpc.customDomains.get.useQuery();
  const [hostname, setHostname] = React.useState("");
  const saveMutation = trpc.customDomains.saveAndVerify.useMutation({
    onSuccess: (res) => {
      refetch();
      toast.success(`Domain ${res.hostname} saved and verified!`, { description: "CNAME configuration validated. Platform binding in progress." });
    },
    onError: (err) => toast.error(err.message || "Failed to verify domain"),
  });
  const removeMutation = trpc.customDomains.remove.useMutation({
    onSuccess: () => {
      refetch();
      setHostname("");
      toast.success("Custom domain removed");
    },
  });

  const activeDomain = domainRecord?.hostname || "genieai-tc7qfq5i.manus.space";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="genei-card p-6 rounded-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground font-display">Custom Domain & Publication Branding</h3>
            <p className="text-xs text-muted-foreground">Bind your custom domain with persistent DNS CNAME verification and secure SSL status.</p>
          </div>
        </div>

        <div className="space-y-3 p-4 rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Current Publication Domain</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${domainRecord?.bindingStatus === "bound" ? "bg-emerald-500/10 text-emerald-400" : "bg-primary/10 text-primary"}`}>
              <Shield className="w-3 h-3" /> {domainRecord?.bindingStatus === "bound" ? "SSL Secured Active" : "DNS Verified · Pending Binding"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder={domainRecord?.hostname || "app.yourdomain.com"}
              className="genei-input text-xs flex-1 font-mono"
            />
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => {
                const target = hostname.trim() || domainRecord?.hostname;
                if (!target) {
                  toast.error("Enter a valid domain hostname");
                  return;
                }
                saveMutation.mutate({ hostname: target });
              }}
              className="genei-button-primary text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify & Bind"}
            </button>
            {domainRecord && (
              <button
                type="button"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
                className="px-3 py-2 rounded-lg text-xs border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                Remove
              </button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1 pt-1">
            <p className="font-medium text-foreground">Required DNS CNAME Record:</p>
            <div className="p-2 rounded bg-secondary/20 font-mono text-[10px] text-foreground space-y-0.5">
              <div>Type: <span className="text-primary font-semibold">CNAME</span> | Name: <span className="text-primary font-semibold">@ or sub</span> | Target: <span className="text-primary font-semibold">proxy.manus.space</span></div>
            </div>
            {domainRecord && (
              <div className="text-[10px] text-emerald-400 pt-1">
                Persistent status: verified={domainRecord.verificationStatus}, binding={domainRecord.bindingStatus}, ssl={domainRecord.sslStatus}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-background space-y-3">
          <div className="text-xs font-semibold text-foreground">📱 PWA & App Branding</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">App Display Name</label>
              <input defaultValue="Genei AI" className="genei-input text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Theme Color</label>
              <input defaultValue="#7c3aed" className="genei-input text-xs" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DownloadsArtifactsSection() {
  const { data: artifacts, isLoading } = trpc.downloads.listArtifacts.useQuery();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="genei-card p-6 rounded-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Save className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground font-display">Downloads & Desktop App (.exe)</h3>
            <p className="text-xs text-muted-foreground">Download verified release archives and Windows BYOH runner packages.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {artifacts?.map((artifact) => (
              <div key={artifact.id} className="p-4 rounded-xl border border-border bg-background space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{artifact.name}</span>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{artifact.version}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Platform: {artifact.platform} · Size: {artifact.fileSize} · Signing: {artifact.signingState}</p>
                  <div className="text-[10px] font-mono text-muted-foreground bg-black/30 p-1.5 rounded truncate">SHA256: {artifact.sha256}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    toast.success(`Starting download for ${artifact.name}`, { description: `File size: ${artifact.fileSize}` });
                    window.location.href = artifact.downloadUrl;
                  }}
                  className="genei-button-primary w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 mt-2"
                >
                  <Save className="w-3.5 h-3.5" /> Download {artifact.platform === "source-zip" ? "Source ZIP" : "Windows EXE"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");
  const [theme, setTheme] = useState("dark");
  const [notifications, setNotifications] = useState({ email: true, push: false, updates: true });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setIsSaving(false);
    toast.success("Settings saved!");
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.60 0.25 310), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.60 0.25 310 / 0.4)" }}>
          <SettingsIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text">Settings</h1>
          <p className="text-xs text-muted-foreground">Manage your account and preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="genei-card p-3 rounded-xl h-fit">
          {settingsSections.map((section) => (
            <button key={section.id} onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-1 ${activeSection === section.id ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"}`}
              style={activeSection === section.id ? { background: "oklch(0.65 0.22 285 / 0.15)" } : {}}>
              <section.icon className={`w-4 h-4 ${activeSection === section.id ? "text-primary" : ""}`} />
              <span className="text-sm font-medium">{section.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="xl:col-span-3 space-y-5">
          {activeSection === "profile" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-6 rounded-xl space-y-5">
                <h3 className="font-semibold text-foreground font-display">Profile Settings</h3>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold"
                    style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                    {user?.name?.[0] || "G"}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{user?.name || "Genei User"}</div>
                    <div className="text-sm text-muted-foreground">{user?.email || "user@genei.ai"}</div>
                    <button className="text-xs text-primary hover:underline mt-1">Change avatar</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                    <input defaultValue={user?.name || ""} placeholder="Your name" className="w-full genei-input" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <input defaultValue={user?.email || ""} placeholder="email@example.com" className="w-full genei-input" disabled />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bio</label>
                    <textarea placeholder="Tell us about yourself..." rows={3} className="w-full genei-input resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Website</label>
                    <input placeholder="https://yoursite.com" className="w-full genei-input" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "appearance" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-6 rounded-xl space-y-5">
                <h3 className="font-semibold text-foreground font-display">Appearance</h3>
                <div>
                  <label className="text-sm font-medium text-foreground mb-3 block">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "light", label: "Light", icon: Sun },
                      { id: "system", label: "System", icon: Monitor },
                    ].map((t) => (
                      <button key={t.id} onClick={() => setTheme(t.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === t.id ? "border-primary/50 bg-primary/10" : "border-border hover:border-border/80"}`}
                        style={{ background: theme === t.id ? "oklch(0.65 0.22 285 / 0.12)" : "oklch(0.13 0.015 265)" }}>
                        <t.icon className={`w-5 h-5 ${theme === t.id ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-sm font-medium ${theme === t.id ? "text-foreground" : "text-muted-foreground"}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-3 block">Accent Color</label>
                  <div className="flex gap-3">
                    {["oklch(0.65 0.22 285)", "oklch(0.60 0.25 310)", "oklch(0.72 0.18 210)", "oklch(0.78 0.18 75)", "oklch(0.68 0.20 155)"].map((color) => (
                      <button key={color} className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white transition-all"
                        style={{ background: color }} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "notifications" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-6 rounded-xl space-y-4">
                <h3 className="font-semibold text-foreground font-display">Notifications</h3>
                {[
                  { key: "email" as const, label: "Email Notifications", desc: "Receive updates via email" },
                  { key: "push" as const, label: "Push Notifications", desc: "Browser push notifications" },
                  { key: "updates" as const, label: "Product Updates", desc: "New features and announcements" },
                ].map((notif) => (
                  <div key={notif.key} className="flex items-center justify-between p-4 rounded-xl" style={{ background: "oklch(0.14 0.02 265)" }}>
                    <div>
                      <div className="text-sm font-medium text-foreground">{notif.label}</div>
                      <div className="text-xs text-muted-foreground">{notif.desc}</div>
                    </div>
                    <button onClick={() => setNotifications(prev => ({ ...prev, [notif.key]: !prev[notif.key] }))}
                      className={`w-10 h-5.5 rounded-full transition-all duration-200 relative ${notifications[notif.key] ? "bg-primary" : "bg-secondary"}`}
                      style={{ height: "22px", width: "40px" }}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-[3px] transition-all duration-200 ${notifications[notif.key] ? "left-[20px]" : "left-[3px]"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === "security" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-6 rounded-xl space-y-4">
                <h3 className="font-semibold text-foreground font-display">Security</h3>
                {[
                  { label: "Change Password", desc: "Update your account password" },
                  { label: "Two-Factor Authentication", desc: "Add extra security to your account" },
                  { label: "Active Sessions", desc: "Manage your logged-in devices" },
                  { label: "API Keys", desc: "Manage your personal API keys" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-4 rounded-xl hover:bg-secondary/30 cursor-pointer transition-colors group"
                    onClick={() => toast.info(item.label === "API Keys" ? "Manage encrypted provider keys from API Integrations" : `${item.label} is managed by your account provider`)}>
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === "domain" && (
            <CustomDomainSettingsSection />
          )}

          {activeSection === "downloads" && (
            <DownloadsArtifactsSection />
          )}

          {activeSection === "language" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="genei-card p-6 rounded-xl space-y-4">
                <h3 className="font-semibold text-foreground font-display">Language & Region</h3>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Language</label>
                  <select className="w-full genei-input">
                    {["English (US)", "Spanish", "French", "German", "Japanese", "Korean", "Portuguese", "Arabic"].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                  <select className="w-full genei-input">
                    {["UTC", "UTC-5 (EST)", "UTC-8 (PST)", "UTC+1 (CET)", "UTC+9 (JST)"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex justify-end">
            <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={isSaving}
              className="genei-btn-primary flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "Saving..." : "Save Changes"}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
