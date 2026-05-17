import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Mail, Crown, Shield, User, ChevronDown, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const roles = [
  { id: "owner", label: "Owner", icon: Crown, color: "oklch(0.78 0.18 75)", desc: "Full access" },
  { id: "admin", label: "Admin", icon: Shield, color: "oklch(0.65 0.22 285)", desc: "Manage team" },
  { id: "editor", label: "Editor", icon: User, color: "oklch(0.72 0.18 210)", desc: "Create & edit" },
  { id: "viewer", label: "Viewer", icon: User, color: "oklch(0.60 0.25 310)", desc: "View only" },
];

const mockMembers = [
  { id: 1, name: "You (Owner)", email: "owner@genei.ai", role: "owner", avatar: "Y", joined: "Today" },
];

export default function TeamWorkspace() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [copied, setCopied] = useState(false);
  const inviteLink = `https://genei.ai/invite/${Math.random().toString(36).slice(2, 10)}`;

  const handleInvite = () => {
    if (!inviteEmail.trim()) { toast.error("Enter an email address"); return; }
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Invite link copied!");
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.72 0.18 210), oklch(0.65 0.22 285))", boxShadow: "0 0 20px oklch(0.72 0.18 210 / 0.4)" }}>
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display genei-gradient-text-cyan">Team Workspace</h1>
          <p className="text-xs text-muted-foreground">Collaborate with your team</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Invite */}
          <div className="genei-card p-5 rounded-xl space-y-4">
            <h3 className="font-semibold text-foreground font-display">Invite Team Members</h3>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@email.com" className="w-full pl-9 genei-input" />
              </div>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="genei-input w-32">
                {roles.slice(1).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button onClick={handleInvite} className="genei-btn-primary flex items-center gap-2 px-4">
                <Plus className="w-4 h-4" /> Invite
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "oklch(0.14 0.02 265)" }}>
              <span className="text-xs text-muted-foreground flex-1 font-mono truncate">{inviteLink}</span>
              <button onClick={copyLink} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          {/* Members */}
          <div className="genei-card rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground font-display">Team Members</h3>
              <span className="genei-badge-purple text-xs">{mockMembers.length} member{mockMembers.length !== 1 ? "s" : ""}</span>
            </div>
            {mockMembers.map((member) => {
              const role = roles.find(r => r.id === member.role);
              return (
                <div key={member.id} className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                    {member.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{member.name}</div>
                    <div className="text-xs text-muted-foreground">{member.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {role && (
                      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border"
                        style={{ color: role.color }}>
                        <role.icon className="w-3 h-3" /> {role.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">Joined {member.joined}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Roles */}
        <div className="space-y-5">
          <div className="genei-card p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground font-display">Permission Levels</h3>
            {roles.map((role) => (
              <div key={role.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "oklch(0.14 0.02 265)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${role.color} / 0.15` }}>
                  <role.icon className="w-4 h-4" style={{ color: role.color }} />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{role.label}</div>
                  <div className="text-xs text-muted-foreground">{role.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
