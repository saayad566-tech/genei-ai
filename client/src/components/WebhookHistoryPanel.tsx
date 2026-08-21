import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Filter, History, Loader2, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const statusOptions = ["all", "received", "applied", "ignored", "failed"] as const;
type StatusFilter = (typeof statusOptions)[number];

type ReceiptStatus = "received" | "applied" | "ignored" | "failed";
type WebhookReceipt = { id: number; provider: string; externalTaskId: string; eventType: string; payloadHash: string; status: ReceiptStatus; processedAt: Date | string | null; createdAt: Date | string };

const statusMeta: Record<ReceiptStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  received: { label: "Received", className: "text-sky-300 bg-sky-400/10 border-sky-400/20", icon: Clock3 },
  applied: { label: "Applied", className: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", icon: CheckCircle2 },
  ignored: { label: "Ignored", className: "text-amber-300 bg-amber-400/10 border-amber-400/20", icon: AlertCircle },
  failed: { label: "Failed", className: "text-rose-300 bg-rose-400/10 border-rose-400/20", icon: XCircle },
};

function formatDate(value: Date | string | null) {
  if (!value) return "Not processed";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function WebhookHistoryPanel() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [provider, setProvider] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = trpc.globalSettings.getWebhookReceipts.useQuery({
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    provider: provider === "all" ? undefined : provider,
    limit: 100,
  }, { refetchInterval: 15000 });

  const receipts = (query.data ?? []) as WebhookReceipt[];
  const providers = useMemo(() => Array.from(new Set(receipts.map((receipt) => receipt.provider))).sort(), [receipts]);
  const selectedReceipt = receipts.find((receipt) => receipt.id === selectedId);

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setProvider("all");
  };

  return (
    <section className="genei-card rounded-2xl border border-border p-5 sm:p-6" aria-labelledby="webhook-history-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><History className="h-5 w-5" /></div>
          <div>
            <h2 id="webhook-history-title" className="font-display text-base font-semibold text-foreground">Webhook notification history</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Review verified provider callbacks, see whether Genei applied them, and open the delivery details when something needs attention.</p>
          </div>
        </div>
        <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-wait disabled:opacity-60" aria-label="Refresh webhook notification history">
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search webhook history</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search provider, task ID, or event type" className="genei-input w-full pl-9 text-xs" />
        </label>
        <button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${showFilters ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="mt-3 grid gap-3 rounded-xl border border-border/60 bg-secondary/10 p-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="genei-input w-full text-xs" aria-label="Filter webhook history by status">
              {statusOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All statuses" : statusMeta[option].label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="genei-input w-full text-xs" aria-label="Filter webhook history by provider">
              <option value="all">All providers</option>
              {providers.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {(search || status !== "all" || provider !== "all") && <button type="button" onClick={clearFilters} className="text-left text-xs text-primary hover:underline sm:col-span-2">Clear filters</button>}
        </div>
      )}

      {query.isLoading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading notification history...</div>
      ) : query.isError ? (
        <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"><div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> We couldn’t load webhook history</div><p className="mt-1 text-xs text-rose-200/70">Check your connection and try again. Your saved webhook settings are unchanged.</p><button type="button" onClick={() => query.refetch()} className="mt-3 rounded-lg border border-rose-300/30 px-3 py-1.5 text-xs hover:bg-rose-300/10">Try again</button></div>
      ) : receipts.length === 0 ? (
        <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-secondary/5 px-6 text-center"><ShieldCheck className="h-8 w-8 text-primary/70" /><h3 className="mt-3 text-sm font-medium text-foreground">No webhook notifications yet</h3><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">When a connected provider sends a signed callback, it will appear here with its verification and processing status.</p></div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-secondary/20 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Provider / event</th><th className="px-4 py-3 font-medium">Task ID</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Processed</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {receipts.map((receipt) => {
                  const meta = statusMeta[receipt.status as ReceiptStatus] ?? statusMeta.received;
                  const StatusIcon = meta.icon;
                  return <tr key={receipt.id} tabIndex={0} onClick={() => setSelectedId(selectedId === receipt.id ? null : receipt.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(selectedId === receipt.id ? null : receipt.id); } }} className="cursor-pointer transition-colors hover:bg-secondary/10 focus:bg-secondary/10 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary/60" aria-label={`View ${receipt.provider} ${receipt.eventType} notification details`}>
                    <td className="px-4 py-3"><div className="font-medium capitalize text-foreground">{receipt.provider}</div><div className="mt-0.5 text-muted-foreground">{receipt.eventType}</div></td>
                    <td className="max-w-[220px] truncate px-4 py-3 font-mono text-[11px] text-muted-foreground" title={receipt.externalTaskId}>{receipt.externalTaskId}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${meta.className}`}><StatusIcon className="h-3 w-3" />{meta.label}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground" title={new Date(receipt.createdAt).toLocaleString()}>{formatDate(receipt.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground" title={receipt.processedAt ? new Date(receipt.processedAt).toLocaleString() : undefined}>{formatDate(receipt.processedAt)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Showing {receipts.length} notification{receipts.length === 1 ? "" : "s"}. Select a row to view delivery details.</p>
          {selectedReceipt && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4" aria-live="polite"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Delivery details</div><button type="button" onClick={() => setSelectedId(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button></div><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Payload fingerprint</dt><dd className="mt-1 break-all font-mono text-foreground">{selectedReceipt.payloadHash}</dd></div><div><dt className="text-muted-foreground">Receipt ID</dt><dd className="mt-1 font-mono text-foreground">#{selectedReceipt.id}</dd></div><div><dt className="text-muted-foreground">Received</dt><dd className="mt-1 text-foreground">{formatDate(selectedReceipt.createdAt)}</dd></div><div><dt className="text-muted-foreground">Processed</dt><dd className="mt-1 text-foreground">{formatDate(selectedReceipt.processedAt)}</dd></div></dl></div>}
        </>
      )}
    </section>
  );
}
