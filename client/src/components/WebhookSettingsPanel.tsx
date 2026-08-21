import React, { useState } from "react";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Webhook, KeyRound, ShieldCheck, Send } from "lucide-react";
import { toast } from "sonner";

export default function WebhookSettingsPanel() {
  const utils = trpc.useUtils();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const settingsQuery = trpc.globalSettings.getWebhookSettings.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: false });
  const { data: settings, isLoading, isError } = settingsQuery;
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
      toast.success("Webhook endpoint configured successfully", { description: "Genei is now listening for signed provider delivery callbacks." });
      utils.globalSettings.getWebhookSettings.invalidate();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (authLoading || (isAuthenticated && isLoading)) {
    return <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> {authLoading ? "Checking sign-in..." : "Loading webhook settings..."}</div>;
  }

  if (!isAuthenticated) {
    return <div className="genei-card rounded-2xl border border-border bg-secondary/10 p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h3 className="font-display text-base font-semibold text-foreground">Sign in to manage webhooks</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Webhook secrets and provider callbacks belong to your private workspace. Sign in to save settings, test deliveries, and review retryable events.</p><a href={getLoginUrl()} className="genei-button-primary mt-4 inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold">Sign in to Genei AI</a></div></div></div>;
  }

  if (isError) {
    return <div className="genei-card rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6 text-sm text-rose-200"><div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" /> Webhook settings need attention</div><p className="mt-1 text-xs leading-5 text-rose-200/70">Genei could not load your saved settings. Check your connection and try again.</p><button type="button" onClick={() => settingsQuery.refetch()} className="mt-3 rounded-lg border border-rose-300/30 px-3 py-1.5 text-xs hover:bg-rose-300/10">Try again</button></div>;
  }

  return (
    <div className="genei-card space-y-6 rounded-2xl border border-border p-6 bg-secondary/10">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Webhook className="h-5 w-5" /></div>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">User-Managed Webhook Receiver</h3>
          <p className="text-xs text-muted-foreground">Receive signed delivery callbacks from Runway, Pika, Kling, or HeyGen directly into your Genei workspace.</p>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-muted-foreground/80"><span className="font-medium text-foreground">How it works:</span> paste the callback URL and signing secret from your provider, save once, then use Webhook History below to confirm each delivery. You can leave this disabled until your provider is ready.</p>
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border accent-primary" /> Enable automated webhook job advancement and media persistence</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => toast.info("Use a real signed provider callback to test", { description: "Save your settings, then run a preview job with Runway, Pika, Kling, or HeyGen. Genei will show the verified delivery in Webhook History." })} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-primary" /> How to test</button>
          <button type="button" disabled={saveMutation.isPending} onClick={() => { if (enabled && !url.trim()) { toast.error("Add a webhook target URL first", { description: "Paste the callback URL provided by your video provider, or disable the receiver until it is ready." }); return; } if (enabled && !secret.trim()) { toast.error("Add the signing secret first", { description: "The secret is required to verify callbacks safely." }); return; } saveMutation.mutate({ webhookUrl: url.trim(), webhookSecret: secret.trim(), enabled }); }} className="genei-button-primary flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold">{saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{saved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}<span>{saved ? "Saved successfully" : "Save webhook settings"}</span></button>
        </div>
      </div>
    </div>
  );
}
