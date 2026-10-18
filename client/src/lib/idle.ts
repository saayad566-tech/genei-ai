import { useEffect, useRef } from "react";

/**
 * Idle-time work and visibility-aware polling.
 *
 * Two habits that keep a long-running desktop app feeling light:
 *
 *  - Do optional work when the main thread is idle, rather than competing with the
 *    interaction the user is waiting for.
 *  - Stop polling when the window is not visible. A background tab that keeps fetching
 *    is spending someone's battery to update something nobody is looking at.
 */

/** Run work when the browser is idle, with a timeout so it is not deferred forever. */
export function whenIdle(callback: () => void, timeoutMs = 2000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof requestIdle === "function") {
    const id = requestIdle(callback, { timeout: timeoutMs });
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cancel?.(id);
    };
  }
  // Safari has no requestIdleCallback; a short timeout is the honest fallback.
  const timer = setTimeout(callback, Math.min(timeoutMs, 200));
  return () => clearTimeout(timer);
}

/** Run an optional task once, when idle, on mount. */
export function useIdleEffect(callback: () => void, deps: unknown[] = [], timeoutMs = 2000): void {
  const ref = useRef(callback);
  useEffect(() => { ref.current = callback; }, [callback]);
  useEffect(() => {
    const cancel = whenIdle(() => ref.current(), timeoutMs);
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Poll on an interval, but only while the window is visible.
 *
 * On becoming visible again it refreshes immediately, because stale data the user is
 * about to look at should not wait a full interval.
 */
export function useVisiblePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const ref = useRef(callback);
  useEffect(() => { ref.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") ref.current();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        ref.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

/** Debounce a callback to the next animation frame. */
export function onNextFrame(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const id = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(id);
}

/** Observe an element's size, coalesced to one call per frame. */
export function observeResize(element: HTMLElement, callback: (rect: DOMRectReadOnly) => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;
  let frame: number | null = null;
  let latest: DOMRectReadOnly | null = null;
  const observer = new ResizeObserver((entries) => {
    latest = entries[0]?.contentRect;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (latest) callback(latest);
    });
  });
  observer.observe(element);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
