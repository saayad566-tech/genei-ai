import React, { useState } from "react";
import { AlertTriangle, Bell, Check, CircleCheck, ExternalLink, Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function AppNotificationCenter() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const notifications = trpc.appNotifications.list.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchInterval: isAuthenticated ? 10000 : false });
  const markRead = trpc.appNotifications.markRead.useMutation({
    onSuccess: () => utils.appNotifications.list.invalidate(),
  });
  const items = notifications.data ?? [];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70" aria-label={`Notifications${items.length ? `, ${items.length} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {items.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
      </button>
      {open && <>
        <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/30" role="dialog" aria-label="Operator notifications">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3"><div><h2 className="text-sm font-semibold text-foreground">Operator notifications</h2><p className="text-[11px] text-muted-foreground">Blocked jobs and manual review requests</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">{items.length} unread</span></div>
          {authLoading ? <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Checking sign-in...</div> : !isAuthenticated ? <div className="px-4 py-8 text-center"><Bell className="mx-auto mb-2 h-6 w-6 text-primary/70" /><p className="text-sm font-medium text-foreground">Sign in to view alerts</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Blocked jobs and continuity reviews are private to your workspace.</p><a href={getLoginUrl()} className="genei-button-primary mt-4 inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold">Sign in to Genei AI</a></div> : notifications.isLoading ? <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading alerts...</div> : notifications.isError ? <div className="px-4 py-8 text-center text-xs text-rose-200"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />Couldn’t load alerts. Try again shortly.</div> : items.length === 0 ? <div className="px-4 py-8 text-center"><CircleCheck className="mx-auto h-7 w-7 text-emerald-300" /><p className="mt-2 text-sm font-medium text-foreground">You’re all caught up</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Genei will place blocked jobs and continuity reviews here.</p></div> : <div className="max-h-[min(24rem,60vh)] overflow-y-auto">{items.map((item) => <div key={item.id} className="border-b border-border/50 px-4 py-3 last:border-b-0"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-amber-400/10 p-1.5 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.message}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span><Link href="/director" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">Open Director <ExternalLink className="h-3 w-3" /></Link><button type="button" onClick={() => markRead.mutate({ id: item.id })} disabled={markRead.isPending} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><Check className="h-3 w-3" /> Mark read</button></div></div></div></div>)}</div>}
        </div>
      </>}
    </div>
  );
}
