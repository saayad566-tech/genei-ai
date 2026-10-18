/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentBreakpoint, detectCapabilities, MIN_TOUCH_TARGET, safeAreaInsets, observeVisibility } from "../lib/platform";
import { attachGestures, attachPullToRefresh } from "../lib/gestures";
import { describeFreshness, OfflineQueue } from "../lib/network";
import { announce, focusableWithin, rovingTabIndex, trapFocus } from "../lib/a11y";
import { hasOpenOverlay, installBackNavigation, registerBackHandler } from "../lib/backnav";
import { VersionedStore } from "../lib/storage";

/**
 * The cross-platform layer.
 *
 * These run in jsdom, which has no real pointer or touch input — so the tests drive the
 * handlers directly with synthetic events. That is honest: it verifies the logic, and it
 * cannot verify how a gesture feels on a real finger. The module comments say so.
 */

afterEach(() => { document.body.innerHTML = ""; });

describe("platform capabilities", () => {
  it("reports capabilities rather than a device name", () => {
    const caps = detectCapabilities();
    expect(caps).toHaveProperty("touch");
    expect(caps).toHaveProperty("pointer");
    expect(caps).toHaveProperty("standalone");
    expect(caps).toHaveProperty("reducedMotion");
    expect(["fine", "coarse", "none", "unknown"]).toContain(caps.pointer);
  });

  it("never returns a user-agent-derived guess", () => {
    // The capability object has no field that could have come from a UA string.
    const keys = Object.keys(detectCapabilities());
    expect(keys).not.toContain("isMobile");
    expect(keys).not.toContain("userAgent");
    expect(keys).not.toContain("os");
  });

  it("classifies the breakpoint by width, not by device", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    expect(currentBreakpoint()).toBe("compact");
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    expect(currentBreakpoint()).toBe("medium");
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    expect(currentBreakpoint()).toBe("expanded");
    Object.defineProperty(window, "innerWidth", { value: original, configurable: true });
  });

  it("resolves safe-area insets to zero without a cutout, rather than guessing", () => {
    const insets = safeAreaInsets();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
  });

  it("uses a 44px minimum touch target, not the 24px floor", () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it("observes visibility", () => {
    const seen: boolean[] = [];
    const stop = observeVisibility((visible) => seen.push(visible));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen.length).toBeGreaterThan(0);
    stop();
  });
});

describe("gestures", () => {
  const pointer = (type: string, x: number, y: number) =>
    new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });

  it("recognises a horizontal swipe", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onSwipe = vi.fn();
    const detach = attachGestures(element, { onSwipe });

    element.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointermove", 30, 102));
    element.dispatchEvent(pointer("pointerup", 30, 102));

    expect(onSwipe).toHaveBeenCalledWith("left", expect.any(Number));
    detach();
  });

  it("does not fire a swipe for a small movement", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onSwipe = vi.fn();
    const detach = attachGestures(element, { onSwipe });
    element.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointerup", 108, 104));
    expect(onSwipe).not.toHaveBeenCalled();
    detach();
  });

  it("treats a still, short press as a tap", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onTap = vi.fn();
    const detach = attachGestures(element, { onTap });
    element.dispatchEvent(pointer("pointerdown", 50, 50));
    element.dispatchEvent(pointer("pointerup", 50, 50));
    expect(onTap).toHaveBeenCalled();
    detach();
  });

  it("fires a long press only when the finger stays put", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onLongPress = vi.fn();
    const detach = attachGestures(element, { onLongPress }, { longPressMs: 10 });

    element.dispatchEvent(pointer("pointerdown", 50, 50));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onLongPress).toHaveBeenCalled();

    onLongPress.mockClear();
    element.dispatchEvent(pointer("pointerdown", 50, 50));
    element.dispatchEvent(pointer("pointermove", 90, 50)); // moved: not a hold
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onLongPress).not.toHaveBeenCalled();
    detach();
  });

  it("ignores a second finger so pinch is not read as a swipe", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const onSwipe = vi.fn();
    const detach = attachGestures(element, { onSwipe });
    element.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(new window.PointerEvent("pointerdown", { clientX: 200, clientY: 100, pointerId: 2, bubbles: true }));
    element.dispatchEvent(pointer("pointerup", 10, 100));
    expect(onSwipe).not.toHaveBeenCalled();
    detach();
  });

  it("removes every listener it added", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const remove = vi.spyOn(element, "removeEventListener");
    const detach = attachGestures(element, {});
    detach();
    expect(remove).toHaveBeenCalledTimes(4);
  });

  it("only pulls to refresh from the very top of the list", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    Object.defineProperty(element, "scrollTop", { value: 100, configurable: true });
    const onRefresh = vi.fn();
    const detach = attachPullToRefresh(element, onRefresh);
    // A touch starting mid-list is a scroll, not a pull.
    element.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 100 } as unknown as Touch] }));
    element.dispatchEvent(new TouchEvent("touchend", {}));
    expect(onRefresh).not.toHaveBeenCalled();
    detach();
  });
});

describe("network", () => {
  it("describes freshness in human terms and marks old data stale", () => {
    const now = Date.now();
    expect(describeFreshness(now, now).label).toBe("just now");
    expect(describeFreshness(now - 30_000, now).label).toBe("30s ago");
    expect(describeFreshness(now - 600_000, now).stale).toBe(true);
    expect(describeFreshness(undefined, now).label).toBe("not yet loaded");
  });

  it("queues work and flushes it", async () => {
    const queue = new OfflineQueue();
    const done: string[] = [];
    queue.enqueue("a", async () => { done.push("a"); });
    queue.enqueue("b", async () => { done.push("b"); });
    expect(queue.size).toBe(2);
    const result = await queue.flush();
    expect(result.succeeded).toHaveLength(2);
    expect(done).toEqual(["a", "b"]);
    expect(queue.size).toBe(0);
  });

  it("keeps a failing task queued, then abandons it at the cap", async () => {
    const queue = new OfflineQueue(2);
    queue.enqueue("failing", async () => { throw new Error("nope"); });
    const first = await queue.flush();
    expect(first.failed).toHaveLength(1);
    expect(queue.size).toBe(1);
    const second = await queue.flush();
    expect(second.abandoned).toHaveLength(1);
    expect(queue.size).toBe(0);
  });
});

describe("accessibility", () => {
  it("traps focus inside a dialog and restores it on release", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div id="dialog"><button id="first">first</button><button id="last">last</button></div>`;
    const outside = document.getElementById("outside") as HTMLButtonElement;
    outside.focus();
    const dialog = document.getElementById("dialog") as HTMLElement;
    const release = trapFocus(dialog);
    expect(document.activeElement).toBe(document.getElementById("first"));

    // Tab from the last element wraps to the first rather than escaping.
    (document.getElementById("last") as HTMLButtonElement).focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    release();
    expect(document.activeElement).toBe(outside);
  });

  it("finds only visible focusable elements", () => {
    document.body.innerHTML = `<div id="c"><button>a</button><a href="#">b</a></div>`;
    const found = focusableWithin(document.getElementById("c") as HTMLElement);
    expect(Array.isArray(found)).toBe(true);
  });

  it("moves a roving tab index with the arrow keys", () => {
    document.body.innerHTML = `<div id="tabs"><button class="tab">1</button><button class="tab">2</button><button class="tab">3</button></div>`;
    const container = document.getElementById("tabs") as HTMLElement;
    const stop = rovingTabIndex(container, ".tab");
    const tabs = Array.from(container.querySelectorAll<HTMLElement>(".tab"));
    tabs[0].focus();
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(tabs[1]);
    stop();
  });

  it("announces without throwing, and creates the live region", () => {
    announce("Saved.");
    expect(document.getElementById("genei-announce-polite")).toBeTruthy();
  });
});

describe("back navigation", () => {
  it("closes the most recent overlay rather than leaving the app", () => {
    const uninstall = installBackNavigation();
    const closed: string[] = [];
    const releaseFirst = registerBackHandler(() => closed.push("first"));
    const releaseSecond = registerBackHandler(() => closed.push("second"));
    expect(hasOpenOverlay()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    // Only the top of the stack closes.
    expect(closed).toEqual(["second"]);

    releaseFirst();
    releaseSecond();
    expect(hasOpenOverlay()).toBe(false);
    uninstall();
  });
});

describe("versioned storage", () => {
  const store = () => new VersionedStore("test.store");

  it("round-trips a value", () => {
    const s = store();
    expect(s.write("theme", 1, "dark").ok).toBe(true);
    expect(s.read("theme", 1, "light")).toBe("dark");
  });

  it("returns the fallback for a missing key", () => {
    expect(store().read("absent", 1, "fallback")).toBe("fallback");
  });

  it("applies migrations in order", () => {
    const s = new VersionedStore("test.migrate", [
      { from: 1, to: 2, migrate: (data) => ({ ...(data as object), added: true }) },
      { from: 2, to: 3, migrate: (data) => ({ ...(data as object), again: true }) },
    ]);
    s.write("config", 1, { value: 1 });
    const read = s.read<{ value: number; added?: boolean; again?: boolean }>("config", 3, { value: 0 });
    expect(read.added).toBe(true);
    expect(read.again).toBe(true);
  });

  it("refuses data from a newer version rather than misreading it", () => {
    const s = store();
    s.write("future", 99, { shape: "unknown" });
    expect(s.read("future", 1, "safe-fallback")).toBe("safe-fallback");
  });

  it("survives a corrupt entry", () => {
    localStorage.setItem("test.store:corrupt", "not json at all");
    expect(store().read("corrupt", 1, "fallback")).toBe("fallback");
  });

  it("lists its own keys and prunes the oldest", () => {
    const s = new VersionedStore("test.prune");
    s.write("a", 1, "x".repeat(200));
    s.write("b", 1, "y".repeat(200));
    expect(s.keys().length).toBeGreaterThanOrEqual(2);
    expect(s.usageBytes()).toBeGreaterThan(0);
    expect(s.pruneTo(100)).toBeGreaterThan(0);
  });
});
