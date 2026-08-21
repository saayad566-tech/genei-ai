import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Webhook, KeyRound, ShieldCheck } from "lucide-react";

export default function WebhookSettingsPanel() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.globalSettings.getWebhookSettings.useQuery();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    if (settings) {
      setUrl(settings.webhookUrl);
      setSecret(settings.webhookSecret);
      setEnabled(settings.enabled);
    }
  }, [settings]);

  const saveMutation = trpc.globalSettings.saveWebhookSettings.useMutation({
    onSuccess: () => {
      setSaved(true);
      utils.globalSettings.getWebhookSettings.invalidate();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading webhook settings...</div>;
  }

  return (
    <div className="genei-card space-y-6 rounded-2xl border border-border p-6 bg-secondary/10">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Webhook className="h-5 w-5" /></div>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">User-Managed Webhook Receiver</h3>
          <p className="text-xs text-muted-foreground">Receive signed delivery callbacks from Runway, Pika, Kling, or HeyGen directly into your Genei workspace.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Webhook Target URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/api/director/webhook/runway" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">HMAC Verification Secret</label>
          <div className="flex items-center gap-2">
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="whsec_..." className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary" />
            <button type="button" onClick={() => setSecret(`whsec_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`)} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Generate</button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border accent-primary" /> Enable automated webhook job advancement and media persistence</label>
        <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ webhookUrl: url, webhookSecret: secret, enabled })} className="genei-button-primary flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold">{saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{saved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}<span>{saved ? "Saved successfully" : "Save webhook settings"}</span></button>
      </div>
    </div>
  );
}
