/**
 * Back navigation.
 *
 * In an installed Android app there is no browser back button, and the system back
 * gesture is the primary way out of anything. If a modal does not close on it, the
 * gesture leaves the app instead — which is the single most jarring thing an installed
 * web app can do.
 *
 * The platform gives us CloseWatcher where it exists, and the History API everywhere
 * else. Both are handled here so a caller only has to say "this overlay is open".
 */

type CloseHandler = () => void;

const handlers: CloseHandler[] = [];
let historyEntryPushed = false;

function hasCloseWatcher(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { CloseWatcher?: unknown }).CloseWatcher === "function";
}

/**
 * Register an overlay so the back gesture closes it rather than leaving the app.
 *
 * Returns a release function. Only the most recently opened overlay is closed, which is
 * what a user expects from a stack of dialogs.
 */
export function registerBackHandler(onBack: CloseHandler): () => void {
  if (typeof window === "undefined") return () => undefined;
  handlers.push(onBack);

  // CloseWatcher gives us the platform's own behaviour where it exists.
  const CloseWatcherCtor = (window as Window & { CloseWatcher?: new (options?: { preventCancel?: boolean }) => { onclose: (() => void) | null; destroy: () => void } }).CloseWatcher;
  const watcher = CloseWatcherCtor ? new CloseWatcherCtor() : null;
  if (watcher) {
    watcher.onclose = () => onBack();
  } else if (!historyEntryPushed) {
    // Fallback: push a history entry so the back gesture pops it rather than the app.
    try {
      window.history.pushState({ geneiOverlay: true }, "");
      historyEntryPushed = true;
    } catch {
      // A history entry is not always permitted; the overlay still closes on Escape.
    }
  }

  return () => {
    const index = handlers.indexOf(onBack);
    if (index !== -1) handlers.splice(index, 1);
    watcher?.destroy();
  };
}

/** Whether any overlay is currently registered. */
export function hasOpenOverlay(): boolean {
  return handlers.length > 0;
}

/**
 * Install the global listeners once.
 *
 * Called at startup. Kept separate from registration so the app can decide when to
 * enable back handling rather than having it happen as a side effect of an import.
 */
export function installBackNavigation(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onPopState = () => {
    const handler = handlers[handlers.length - 1];
    if (handler) {
      handler();
      // Re-arm, so a second back press does not leave the app.
      try {
        window.history.pushState({ geneiOverlay: true }, "");
      } catch { /* not permitted */ }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const handler = handlers[handlers.length - 1];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };

  window.addEventListener("popstate", onPopState);
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("keydown", onKeyDown);
  };
}
