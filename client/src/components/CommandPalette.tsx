import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity, Boxes, Film, Image as ImageIcon, LayoutDashboard, Loader2,
  Music, RefreshCw, Search, Server, Settings, Sparkles, Wand2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Command palette — Ctrl/Cmd+K.
 *
 * The research on desktop apps is consistent: the single highest-value keyboard feature
 * is a palette that reaches everything without the mouse. It also gives the new
 * operations surface a home, so health and readiness are one keystroke away instead of
 * buried in a settings page.
 *
 * Keyboard handling follows the ARIA combobox pattern: ArrowUp/Down move, Enter selects,
 * Escape closes, and the active option is announced rather than only highlighted.
 */

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Create" | "System";
  icon: React.ElementType;
  run: () => void;
  keywords?: string;
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Health is only fetched while the palette is open, so it costs nothing when unused.
  const healthQuery = trpc.ops.health.useQuery(undefined, { enabled: open, refetchOnWindowFocus: false });
  const readinessQuery = trpc.ops.readiness.useQuery(undefined, { enabled: open, refetchOnWindowFocus: false });
  const resetCaches = trpc.ops.resetCaches.useMutation({
    onSuccess: (result) => toast.message("Caches cleared", { description: result.message }),
    onError: (error) => toast.error(error.message),
  });

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => { navigate(path); setOpen(false); };
    return [
      { id: "home", label: "Home", group: "Navigate", icon: LayoutDashboard, run: go("/") },
      { id: "ai-store", label: "AI Store", hint: "Browse and run open-source models", group: "Navigate", icon: Boxes, run: go("/ai-store"), keywords: "models llm hub" },
      { id: "video", label: "Video Studio", group: "Navigate", icon: Film, run: go("/video"), keywords: "film edit" },
      { id: "director", label: "Director Console", group: "Navigate", icon: Activity, run: go("/director"), keywords: "dag jobs" },
      { id: "image", label: "Image Generator", group: "Navigate", icon: ImageIcon, run: go("/image"), keywords: "picture" },
      { id: "music", label: "Music Studio", group: "Navigate", icon: Music, run: go("/music"), keywords: "audio song" },
      { id: "voice", label: "Voice Lab", group: "Navigate", icon: Sparkles, run: go("/voice"), keywords: "speech tts" },
      { id: "assets", label: "Asset Library", group: "Navigate", icon: Boxes, run: go("/assets"), keywords: "files media" },
      { id: "library", label: "Capability Library", group: "Navigate", icon: Server, run: go("/library"), keywords: "tools install" },
      { id: "byoh", label: "Hardware & Runtime", group: "Navigate", icon: Server, run: go("/byoh"), keywords: "runners gpu" },
      { id: "automation", label: "Automation Center", group: "Navigate", icon: Zap, run: go("/automation"), keywords: "workflow" },
      { id: "settings", label: "Settings", group: "Navigate", icon: Settings, run: go("/settings"), keywords: "preferences api keys" },
      { id: "new-project", label: "New project", hint: "Go to Home and create one", group: "Create", icon: Wand2, run: go("/") },
      { id: "new-video", label: "Start a video", group: "Create", icon: Film, run: go("/video") },
      { id: "new-model", label: "Find a model", group: "Create", icon: Boxes, run: go("/ai-store") },
      {
        id: "reset-caches",
        label: "Clear all caches",
        hint: "Force fresh data without restarting",
        group: "System",
        icon: RefreshCw,
        run: () => { resetCaches.mutate(); setOpen(false); },
        keywords: "cache refresh",
      },
    ];
  }, [navigate, resetCaches]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""} ${command.group}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  // Global shortcut. Registered once, and removed on unmount so a hot reload cannot
  // stack duplicate listeners.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after paint, so the input exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  // Keep the highlighted row in view as the selection moves.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length]);

  if (!open) return null;

  const onKeyDownInList = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (filtered.length ? (index - 1 + filtered.length) % filtered.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      filtered[activeIndex]?.run();
    }
  };

  const groups = Array.from(new Set(filtered.map((command) => command.group)));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="gx-panel w-full max-w-xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search commands, pages and actions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDownInList}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined}
          />
          <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            groups.map((group) => (
              <div key={group}>
                <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                {filtered.filter((command) => command.group === group).map((command) => {
                  const index = filtered.indexOf(command);
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      id={`command-${command.id}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === activeIndex}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={command.run}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${index === activeIndex ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint ? <span className="hidden truncate text-[10px] text-muted-foreground sm:block">{command.hint}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Live system state, so the palette is also where you check on the app. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            {healthQuery.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            {healthQuery.data ? `up ${Math.floor(healthQuery.data.uptimeSeconds / 60)}m` : "checking…"}
          </span>
          {readinessQuery.data ? (
            <span className={readinessQuery.data.state === "healthy" ? "text-emerald-300" : "text-amber-300"}>
              {readinessQuery.data.state}
              {readinessQuery.data.checks.find((check) => !check.ok) ? ` — ${readinessQuery.data.checks.find((check) => !check.ok)?.detail}` : ""}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
