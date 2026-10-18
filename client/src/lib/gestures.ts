/**
 * Touch and pointer gestures.
 *
 * Deliberately dependency-free and built on Pointer Events rather than Touch Events:
 * one code path covers mouse, finger and stylus, which is exactly the cross-platform
 * behaviour a Windows and Android build needs from the same component.
 *
 * Every gesture here is additive. The app must remain fully usable with a keyboard and a
 * mouse, so nothing is gesture-only.
 */

export type Point = { x: number; y: number };

export type SwipeDirection = "left" | "right" | "up" | "down";

export type GestureHandlers = {
  onSwipe?: (direction: SwipeDirection, distance: number) => void;
  onLongPress?: (point: Point) => void;
  /** Fires as the finger moves, for a drag that follows the pointer. */
  onDrag?: (delta: Point, point: Point) => void;
  onDragEnd?: (delta: Point) => void;
  onTap?: (point: Point) => void;
};

export type GestureOptions = {
  /** Minimum travel for a swipe, in CSS pixels. */
  swipeThreshold?: number;
  /** Hold time for a long press, in milliseconds. */
  longPressMs?: number;
  /** Movement that cancels a long press — a finger that moves is not holding still. */
  moveTolerance?: number;
  /** Direction to capture. Horizontal drags must not steal a vertical scroll. */
  axis?: "x" | "y" | "both";
};

/**
 * Attach gesture handling to an element.
 *
 * Returns a detach function. The caller is responsible for calling it — a listener that
 * is never removed is a leak, and a desktop app that stays open for weeks accumulates
 * them until the window is slow.
 */
export function attachGestures(element: HTMLElement, handlers: GestureHandlers, options: GestureOptions = {}): () => void {
  const swipeThreshold = options.swipeThreshold ?? 50;
  const longPressMs = options.longPressMs ?? 500;
  const moveTolerance = options.moveTolerance ?? 10;
  const axis = options.axis ?? "both";

  let start: Point | null = null;
  let startTime = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  let moved = false;
  let activePointer: number | null = null;

  const clearTimer = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  };

  const onPointerDown = (event: PointerEvent) => {
    // Ignore a second finger: multi-touch belongs to pinch, not to a swipe.
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    startTime = Date.now();
    longPressFired = false;
    moved = false;

    longPressTimer = setTimeout(() => {
      if (!moved && start) {
        longPressFired = true;
        handlers.onLongPress?.(start);
      }
    }, longPressMs);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (activePointer !== event.pointerId || !start) return;
    const delta = { x: event.clientX - start.x, y: event.clientY - start.y };
    if (Math.hypot(delta.x, delta.y) > moveTolerance) {
      moved = true;
      clearTimer();
    }
    // Only claim the axis the caller asked for, so a horizontal swipe inside a vertical
    // list does not fight the scroll.
    const claimed = axis === "x" ? Math.abs(delta.x) > Math.abs(delta.y)
      : axis === "y" ? Math.abs(delta.y) >= Math.abs(delta.x)
      : true;
    if (claimed) handlers.onDrag?.(delta, { x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    clearTimer();
    if (!start) return;
    const delta = { x: event.clientX - start.x, y: event.clientY - start.y };
    const elapsed = Date.now() - startTime;
    const distance = Math.hypot(delta.x, delta.y);

    if (!moved && !longPressFired && elapsed < longPressMs) {
      handlers.onTap?.({ x: event.clientX, y: event.clientY });
      start = null;
      return;
    }

    if (distance >= swipeThreshold) {
      const horizontal = Math.abs(delta.x) > Math.abs(delta.y);
      const direction: SwipeDirection = horizontal
        ? delta.x > 0 ? "right" : "left"
        : delta.y > 0 ? "down" : "up";
      handlers.onSwipe?.(direction, distance);
    }
    if (moved) handlers.onDragEnd?.(delta);
    start = null;
  };

  const onPointerCancel = () => {
    activePointer = null;
    clearTimer();
    start = null;
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);

  return () => {
    clearTimer();
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerCancel);
  };
}

/**
 * Pull-to-refresh.
 *
 * The browser's own gesture reloads the page, discarding in-memory state and re-running
 * the whole boot sequence. This re-fetches data instead, works the same in every
 * environment, and never fires when the gesture starts mid-list.
 */
export function attachPullToRefresh(
  element: HTMLElement,
  onRefresh: () => void | Promise<void>,
  options: { threshold?: number; maxPull?: number } = {},
): () => void {
  const threshold = options.threshold ?? 70;
  const maxPull = options.maxPull ?? 110;
  let startY: number | null = null;
  let pulling = false;

  const onTouchStart = (event: TouchEvent) => {
    // Only at the very top, or the user is scrolling rather than pulling.
    if (element.scrollTop > 0 || event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    pulling = false;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (startY === null || event.touches.length !== 1) return;
    const delta = event.touches[0].clientY - startY;
    if (delta > 0 && element.scrollTop <= 0) {
      pulling = true;
      // Rubber-band the pull so it feels resisted rather than detached.
      const pull = Math.min(maxPull, delta * 0.5);
      element.style.transform = `translateY(${pull}px)`;
    }
  };

  const onTouchEnd = async () => {
    if (startY === null) return;
    const applied = element.style.transform;
    element.style.transform = "";
    startY = null;
    if (pulling && applied) {
      const pulled = parseFloat(applied.replace(/[^0-9.-]/g, "")) || 0;
      if (pulled >= threshold * 0.5) await onRefresh();
    }
    pulling = false;
  };

  element.addEventListener("touchstart", onTouchStart, { passive: true });
  element.addEventListener("touchmove", onTouchMove, { passive: true });
  element.addEventListener("touchend", onTouchEnd);
  return () => {
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchmove", onTouchMove);
    element.removeEventListener("touchend", onTouchEnd);
  };
}
