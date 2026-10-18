import { useMemo, useState } from "react";
import {
  BadgeCheck, Boxes, Cpu, Download, HardDrive, Loader2, Play, RefreshCw,
  Search, Server, Sparkles, Trash2, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useDebouncedValue } from "@/lib/perf";

/**
 * AI Store — browse, check, download and run open-source models.
 *
 * The store is explicit about what it knows and what it does not: every capability shows
 * the signal behind it, fit is labelled as an estimate, and a model that cannot run here
 * says so before anything is downloaded.
 */

type Compatibility = { status: string; reason: string; estimatedRamGB?: number };
type StoreModel = {
  id: string; author: string; name: string; downloads: number; likes: number;
  gated: boolean; disabled: boolean; pipelineTag?: string;
  profile: {
    primary: string;
    capabilities: Array<{ id: string; confidence: number; basis: string }>;
    parameterScale?: string; quantization?: string; contextLength?: number; notes: string[];
  };
};
type ModelFile = { path: string; sizeBytes: number; url: string; recommended: boolean };

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

const COMPATIBILITY_TONE: Record<string, string> = {
  fits: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
  tight: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  "too-large": "border-rose-300/25 bg-rose-400/10 text-rose-200",
  unknown: "border-white/15 bg-white/5 text-muted-foreground",
};

const COMPATIBILITY_LABEL: Record<string, string> = {
  fits: "Fits this machine",
  tight: "Tight fit",
  "too-large": "Too large here",
  unknown: "Fit unknown",
};

export default function AIStore() {
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState<string>("");
  const [sort, setSort] = useState<"downloads" | "likes" | "recent">("downloads");
  const [ggufOnly, setGgufOnly] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"local" | "hosted">("local");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const capabilitiesQuery = trpc.aiStore.capabilities.useQuery();
  const tokenQuery = trpc.aiStore.token.useQuery();
  const locationQuery = trpc.aiStore.location.useQuery();
  const installedQuery = trpc.aiStore.installed.useQuery();

  // Typing must not fire a request per keystroke. The query settles for 250 ms first,
  // and the previous results stay on screen while the next ones load.
  const debouncedQuery = useDebouncedValue(query, 250);
  const searchQuery = trpc.aiStore.search.useQuery(
    { query: debouncedQuery.trim() || undefined, capability: capability || undefined, sort, ggufOnly, limit: 24 },
    { placeholderData: (previous) => previous, staleTime: 60_000 },
  );

  const detailQuery = trpc.aiStore.detail.useQuery(
    { id: selected ?? "" },
    { enabled: Boolean(selected) },
  );

  const installMutation = trpc.aiStore.install.useMutation({
    onSuccess: (result) => {
      setProgress(null);
      if (result.ok) {
        toast.success("Model installed", { description: result.message });
        void installedQuery.refetch();
      } else {
        toast.error("Install failed", { description: result.message });
      }
    },
    onError: (error) => { setProgress(null); toast.error(error.message); },
  });

  const removeMutation = trpc.aiStore.remove.useMutation({
    onSuccess: (result) => {
      if (result.removed) { toast.message("Removed", { description: result.message }); void installedQuery.refetch(); }
      else toast.error(result.message);
    },
  });

  const runMutation = trpc.aiStore.run.useMutation({
    onSuccess: (result) => {
      if (result.status === "completed") {
        setAnswer(result.content);
        toast.message(`Answered via ${result.via}`);
      } else {
        setAnswer(null);
        toast.error("Could not run", { description: result.error });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const models = (searchQuery.data?.models ?? []) as unknown as StoreModel[];
  const hardware = searchQuery.data?.hardware;
  const detail = detailQuery.data;
  const files = (detail?.files ?? []) as ModelFile[];
  const recommendedFile = files.find((file) => file.recommended) ?? files[0];
  const installedIds = useMemo(
    () => new Set((installedQuery.data ?? []).map((entry) => entry.id.split("/")[0] === entry.id ? entry.id : entry.id)),
    [installedQuery.data],
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg, #00F0FF, #8A5CF6)", boxShadow: "0 0 20px rgba(0,240,255,0.35)" }}
        >
          <Boxes className="h-5 w-5 text-black" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold genei-gradient-text">AI Store</h1>
          <p className="text-xs text-muted-foreground">
            Open-source models from the Hugging Face Hub. Capabilities are classified from each model's real
            metadata, and every label names the signal behind it.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tokenQuery.data?.configured ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-amber-300/25 bg-amber-400/10 text-amber-200"}`}>
              <BadgeCheck className="h-3 w-3" />
              {tokenQuery.data?.configured ? "Hugging Face token stored" : "No Hugging Face token — gated models and hosted runs need one"}
            </span>
            {hardware ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-muted-foreground">
                <Cpu className="h-3 w-3" />
                {hardware.ramGB ? `${hardware.ramGB} GB RAM` : "RAM unread"}
                {hardware.vramGB ? ` · ${hardware.vramGB} GB VRAM` : ""} · {hardware.backends.join(", ")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="gx-panel space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="genei-input w-full pl-9 text-sm"
              placeholder="Search models — a name, an author, or what you want it to do"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="genei-input text-sm" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="downloads">Most downloaded</option>
            <option value="likes">Most liked</option>
            <option value="recent">Recently updated</option>
          </select>
          <button
            type="button"
            className={`gx-seg-btn ${ggufOnly ? "gx-seg" : ""}`}
            onClick={() => setGgufOnly((value) => !value)}
          >
            Runnable locally {ggufOnly ? "only" : "included"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={`gx-seg-btn ${capability === "" ? "gx-seg" : ""}`} onClick={() => setCapability("")}>
            All capabilities
          </button>
          {(capabilitiesQuery.data ?? []).map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.description}
              className={`gx-seg-btn ${capability === entry.id ? "gx-seg" : ""}`}
              onClick={() => setCapability(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Results */}
        <div className="space-y-3 xl:col-span-2">
          {searchQuery.isLoading ? (
            <div className="gx-panel flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : models.length === 0 ? (
            <div className="gx-panel p-8 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-primary/70" />
              <p className="mt-2 text-sm font-medium text-foreground">No models matched</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {searchQuery.data?.note ?? "Try a different search term or capability."}
              </p>
            </div>
          ) : (
            models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => { setSelected(model.id); setAnswer(null); }}
                className={`gx-panel gx-panel-hover block w-full p-4 text-left ${selected === model.id ? "ring-1 ring-primary/50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-foreground">{model.name}</span>
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {model.profile.primary === "general" ? "General" : model.profile.primary}
                      </span>
                      {model.profile.parameterScale ? <span className="text-[10px] text-muted-foreground">{model.profile.parameterScale}</span> : null}
                      {model.profile.quantization ? <span className="text-[10px] text-muted-foreground">· {model.profile.quantization}</span> : null}
                      {model.gated ? <span className="text-[10px] text-amber-300">gated</span> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{model.author} · {formatCount(model.downloads)} downloads · {formatCount(model.likes)} likes</p>
                    {model.profile.capabilities[0] ? (
                      <p className="mt-1 text-[10px] text-muted-foreground/80">Classified from: {model.profile.capabilities[0].basis}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {model.profile.capabilities.slice(1, 4).map((signal) => (
                      <span key={signal.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{signal.id}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail + runtime */}
        <div className="space-y-5">
          {!selected ? (
            <div className="gx-panel p-6 text-center">
              <Boxes className="mx-auto h-7 w-7 text-primary/70" />
              <p className="mt-2 text-sm font-medium text-foreground">Pick a model</p>
              <p className="mt-1 text-xs text-muted-foreground">Its files, fit for this machine and run controls appear here.</p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="gx-panel flex items-center justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="gx-panel space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold text-foreground">{detail?.model.name}</p>
                    <p className="text-[11px] text-muted-foreground">{detail?.model.author}</p>
                  </div>
                  <button type="button" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)} aria-label="Close">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {detail?.compatibility ? (
                  <div className={`rounded-xl border p-3 text-[11px] ${COMPATIBILITY_TONE[detail.compatibility.status] ?? COMPATIBILITY_TONE.unknown}`}>
                    <p className="font-semibold">{COMPATIBILITY_LABEL[detail.compatibility.status] ?? detail.compatibility.status}</p>
                    <p className="mt-1 leading-relaxed">{detail.compatibility.reason}</p>
                  </div>
                ) : null}

                {detail?.error ? (
                  <p className="flex items-start gap-2 text-[11px] text-rose-300">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {detail.error}
                  </p>
                ) : null}

                {(detail?.model.profile.notes ?? []).map((note) => (
                  <p key={note} className="text-[10px] leading-relaxed text-muted-foreground/80">{note}</p>
                ))}

                {/* Every capability with the evidence for it */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Capabilities</p>
                  {(detail?.model.profile.capabilities ?? []).map((signal) => (
                    <div key={signal.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{signal.id}</span>
                        <span className="text-[10px] text-muted-foreground">{Math.round(signal.confidence * 100)}%</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">{signal.basis}</p>
                    </div>
                  ))}
                  {(detail?.model.profile.capabilities ?? []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No capability could be identified from this model's metadata.</p>
                  ) : null}
                </div>

                {/* Files */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Files ({files.length})</p>
                  {files.slice(0, 6).map((file) => (
                    <div key={file.path} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-muted-foreground" title={file.path}>{file.path}</span>
                      <span className="flex-shrink-0 text-muted-foreground/70">
                        {formatBytes(file.sizeBytes)}{file.recommended ? " · suggested" : ""}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="gx-cta w-full"
                  disabled={!recommendedFile || installMutation.isPending}
                  onClick={() => {
                    if (!recommendedFile || !selected) return;
                    setProgress(`Downloading ${formatBytes(recommendedFile.sizeBytes)}…`);
                    installMutation.mutate({ id: selected, filePath: recommendedFile.path, url: recommendedFile.url, expectedBytes: recommendedFile.sizeBytes });
                  }}
                >
                  {installMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {installMutation.isPending ? "Downloading…" : recommendedFile ? `Download ${formatBytes(recommendedFile.sizeBytes)}` : "No downloadable file"}
                </button>
                {progress ? <p className="text-[10px] text-muted-foreground">{progress}</p> : null}
                {locationQuery.data?.directory ? (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                    <HardDrive className="h-3 w-3" /> Saved to {locationQuery.data.directory}
                  </p>
                ) : null}
              </div>

              {/* Run */}
              <div className="gx-panel space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-semibold text-foreground">Run it</p>
                  <div className="flex gap-1">
                    <button type="button" className={`gx-seg-btn ${mode === "local" ? "gx-seg" : ""}`} onClick={() => setMode("local")}>
                      <Cpu className="h-3 w-3" /> Local
                    </button>
                    <button type="button" className={`gx-seg-btn ${mode === "hosted" ? "gx-seg" : ""}`} onClick={() => setMode("hosted")}>
                      <Server className="h-3 w-3" /> Hosted
                    </button>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {mode === "local"
                    ? "Runs through the llama.cpp runtime on this machine, using the downloaded weights."
                    : "Runs through Hugging Face's Inference Providers router using your stored token."}
                </p>
                <textarea
                  className="genei-input w-full resize-none text-sm"
                  rows={3}
                  placeholder="Ask this model something…"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <button
                  type="button"
                  className="gx-cta w-full"
                  disabled={runMutation.isPending || !prompt.trim() || !selected}
                  onClick={() => {
                    if (!selected) return;
                    const local = (installedQuery.data ?? []).find((entry) => entry.id.startsWith(selected) || entry.id.includes(detail?.model.name ?? ""));
                    runMutation.mutate({
                      modelId: selected,
                      mode,
                      messages: [{ role: "user", content: prompt.trim() }],
                      localPath: mode === "local" ? local?.path : undefined,
                    });
                  }}
                >
                  {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {runMutation.isPending ? "Running…" : "Run"}
                </button>
                {answer ? (
                  <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/90">{answer}</p>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {/* Installed */}
          <div className="gx-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 p-4">
              <p className="font-display text-sm font-semibold text-foreground">Installed models</p>
              <button type="button" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground" onClick={() => void installedQuery.refetch()} aria-label="Refresh installed">
                <RefreshCw className={`h-3.5 w-3.5 ${installedQuery.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
            {(installedQuery.data ?? []).length === 0 ? (
              <p className="p-4 text-[11px] text-muted-foreground">Nothing downloaded yet. Installed models appear here and can be run offline.</p>
            ) : (
              (installedQuery.data ?? []).map((entry, index) => (
                <div key={entry.path} className={`flex items-center justify-between gap-2 px-4 py-2.5 ${index < (installedQuery.data ?? []).length - 1 ? "border-b border-white/5" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground" title={entry.id}>{entry.id}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(entry.sizeBytes)}{installedIds.has(entry.id) ? "" : ""}</p>
                  </div>
                  <button
                    type="button"
                    className="flex-shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-rose-300"
                    onClick={() => removeMutation.mutate({ id: entry.id })}
                    aria-label={`Remove ${entry.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
