import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CloudOff, Info, WifiOff, X } from "lucide-react";
import { useNetworkState } from "@/lib/network";
import { trapFocus, announce } from "@/lib/a11y";
import { registerBackHandler } from "@/lib/backnav";
import { MIN_TOUCH_TARGET, safeAreaInsets } from "@/lib/platform";

/**
 * Cross-platform chrome.
 *
 * One set of components that behaves correctly on Windows, Android and in a browser tab:
 * an offline banner that does not block, a confirm dialog that closes on the Android back
 * gesture, an empty state, and a stale-data indicator.
 */

/* ------------------------------------------------------------------ *
 * Offline banner
 * ------------------------------------------------------------------ */

/**
 * Tells the user about connectivity without preventing anything.
 *
 * Deliberately not a gate: `navigator.onLine` is a hint, and blocking a critical action
 * on a hint is how an app refuses to work on a perfectly good connection.
 */
export function OfflineBanner() {
  const network = useNetworkState();
  const [dismissed, setDismissed] = useState(false);
  const previous = useRef(network.online);

  useEffect(() => {
    if (previous.current && !network.online) announce("You are offline. Work will be kept and retried when the connection returns.", "assertive");
    if (!previous.current && network.online) announce("You are back online.", "polite");
    previous.current = network.online;
    if (network.online) setDismissed(false);
  }, [network.online]);

  if (network.online || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-[11px] text-amber-200"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span>Offline. Anything you start is kept and retried when the connection returns.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="rounded p-0.5 hover:bg-white/10"
        style={{ minWidth: 24, minHeight: 24 }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** A quieter note for a connection that works but is slow. */
export function SlowNetworkNote() {
  const network = useNetworkState();
  if (network.quality !== "slow") return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-1 text-[10px] text-muted-foreground">
      <CloudOff className="h-3 w-3 flex-shrink-0" />
      <span>
        Slow connection{network.effectiveType ? ` (${network.effectiveType})` : ""}. Large downloads may take a while.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Confirm dialog
 * ------------------------------------------------------------------ */

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

/**
 * A confirmation for an irreversible action.
 *
 * Traps focus, restores it on close, closes on Escape, and — importantly on Android —
 * registers with the back gesture so a back press dismisses the dialog rather than
 * leaving the app.
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = false, onConfirm, onCancel, children,
}: ConfirmDialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !panel.current) return;
    const releaseFocus = trapFocus(panel.current);
    const releaseBack = registerBackHandler(onCancel);
    announce(title, "polite");
    return () => { releaseFocus(); releaseBack(); };
  }, [open, onCancel, title]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-description" : undefined}
        className="gx-panel w-full max-w-md p-5"
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${destructive ? "bg-rose-400/15 text-rose-300" : "bg-primary/15 text-primary"}`}>
            {destructive ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="font-display text-sm font-semibold text-foreground">{title}</h2>
            {description ? <p id="confirm-description" className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p> : null}
            {children}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="gx-seg-btn" onClick={onCancel} style={{ minHeight: MIN_TOUCH_TARGET }}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "gx-seg-btn border-rose-300/30 bg-rose-400/15 text-rose-200" : "gx-cta"}
            onClick={onConfirm}
            style={{ minHeight: MIN_TOUCH_TARGET }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Empty state
 * ------------------------------------------------------------------ */

export function EmptyState(input: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {input.icon ? <div className="text-primary/70">{input.icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{input.title}</p>
      {input.description ? <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">{input.description}</p> : null}
      {input.action ? <div className="mt-2">{input.action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

/** Says how old the data on screen is, so stale content can be trusted appropriately. */
export function StaleIndicator(input: { label: string; stale: boolean; onRefresh?: () => void }) {
  return (
    <button
      type="button"
      onClick={input.onRefresh}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
        input.stale ? "border-amber-300/25 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/5 text-muted-foreground"
      }`}
      style={{ minHeight: 24 }}
    >
      {input.stale ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
      {input.label}
      {input.onRefresh ? <span className="text-muted-foreground/70">· refresh</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Safe area
 * ------------------------------------------------------------------ */

/**
 * Pad content away from a notch or a gesture bar.
 *
 * `env(safe-area-inset-*)` resolves to zero everywhere without a cutout, so this is safe
 * to apply unconditionally and degrades to no padding rather than guessing at a device.
 */
export function SafeArea({
  children,
  edges = ["top", "bottom"],
}: {
  children: ReactNode;
  edges?: Array<"top" | "right" | "bottom" | "left">;
}) {
  const [insets, setInsets] = useState(() => safeAreaInsets());

  useEffect(() => {
    const update = () => setInsets(safeAreaInsets());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const style: React.CSSProperties = {};
  if (edges.includes("top")) style.paddingTop = insets.top || undefined;
  if (edges.includes("right")) style.paddingRight = insets.right || undefined;
  if (edges.includes("bottom")) style.paddingBottom = insets.bottom || undefined;
  if (edges.includes("left")) style.paddingLeft = insets.left || undefined;

  return <div style={style}>{children}</div>;
}
