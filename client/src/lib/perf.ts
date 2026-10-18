import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Small performance primitives.
 *
 * Each one exists because of a specific way this app was slow: a search box firing a
 * request per keystroke, a resize handler running on every frame, an expensive
 * derivation recomputed on every render, a list rendering thousands of rows.
 */

/** Delay a value's propagation until it has stopped changing. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * A stable debounced callback.
 *
 * The returned function keeps its identity across renders, so passing it to a child does
 * not defeat that child's memoisation — which is the usual way a debounce accidentally
 * becomes a re-render storm.
 */
export function useDebouncedCallback<A extends unknown[]>(callback: (...args: A) => void, delayMs = 250) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return useCallback(
    (...args: A) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );
}

/** Run at most once per interval, with the trailing call included. */
export function useThrottledCallback<A extends unknown[]>(callback: (...args: A) => void, intervalMs = 100) {
  const callbackRef = useRef(callback);
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => () => {
    if (trailing.current) clearTimeout(trailing.current);
  }, []);

  return useCallback(
    (...args: A) => {
      const now = Date.now();
      const elapsed = now - lastRun.current;
      if (elapsed >= intervalMs) {
        lastRun.current = now;
        callbackRef.current(...args);
      } else {
        if (trailing.current) clearTimeout(trailing.current);
        trailing.current = setTimeout(() => {
          lastRun.current = Date.now();
          callbackRef.current(...args);
        }, intervalMs - elapsed);
      }
    },
    [intervalMs],
  );
}

/**
 * Memoise an expensive derivation, bounded to a fixed number of keys.
 *
 * `useMemo` handles the "same inputs, same render" case. This handles the other one: a
 * derivation whose inputs change often and whose results are worth keeping.
 */
export function useBoundedMemo<T>(compute: () => T, key: string, maxEntries = 50): T {
  const store = useRef(new Map<string, T>());
  return useMemo(() => {
    const cache = store.current;
    if (cache.has(key)) {
      const hit = cache.get(key) as T;
      // Refresh recency so the LRU order is real.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const value = compute();
    cache.set(key, value);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
    return value;
    // `compute` is intentionally excluded: the key is the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxEntries]);
}

/**
 * Window a long list so only the visible rows render.
 *
 * Returns the slice to render plus the spacer heights that keep the scrollbar honest.
 * Deliberately dependency-free: a virtualiser is ~30 lines, and this avoids adding a
 * runtime dependency to a desktop bundle for it.
 */
export function useVirtualWindow(input: { itemCount: number; itemHeight: number; viewportHeight: number; scrollTop: number; overscan?: number }) {
  const { itemCount, itemHeight, viewportHeight, scrollTop, overscan = 4 } = input;
  return useMemo(() => {
    const visible = Math.ceil(viewportHeight / itemHeight) || 1;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(itemCount, start + visible + overscan * 2);
    return {
      start,
      end,
      paddingTop: start * itemHeight,
      paddingBottom: Math.max(0, (itemCount - end) * itemHeight),
      totalHeight: itemCount * itemHeight,
    };
  }, [itemCount, itemHeight, viewportHeight, scrollTop, overscan]);
}

/**
 * Measure long tasks in the renderer.
 *
 * The research is blunt about this: you cannot improve what you do not measure, and the
 * metric that matters for a desktop app is interaction latency, not page load. This
 * records tasks over 50 ms — the threshold the Long Tasks API uses — so the diagnostics
 * surface can show whether the UI is actually smooth rather than claiming it is.
 */
export function observeLongTasks(onTask: (durationMs: number) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => undefined;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) onTask(Math.round(entry.duration));
    });
    observer.observe({ entryTypes: ["longtask"] });
    return () => observer.disconnect();
  } catch {
    return () => undefined;
  }
}
