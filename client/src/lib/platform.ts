/**
 * Platform capabilities, by feature detection.
 *
 * The research is unambiguous: never infer capability from a user-agent string. UA
 * strings are spoofable, frozen by browsers, and wrong often enough to matter. Every
 * question here is answered by testing for the thing itself, and every answer is a
 * capability rather than a device name.
 *
 * This is what lets one codebase serve the Windows desktop app, the Android build and a
 * browser tab without pretending they are the same device.
 */

export type PointerKind = "fine" | "coarse" | "none" | "unknown";

export type PlatformCapabilities = {
  /** True when the primary input is a finger. */
  touch: boolean;
  /** True when any available input is coarse — a laptop with a touchscreen. */
  anyTouch: boolean;
  pointer: PointerKind;
  /** Installed rather than in a tab. */
  standalone: boolean;
  displayMode: "standalone" | "fullscreen" | "minimal-ui" | "browser" | "unknown";
  /** Whether the platform offers an install prompt at all. iOS never fires it. */
  canPromptInstall: boolean;
  /** Whether the visual viewport is available for keyboard detection. */
  hasVisualViewport: boolean;
  /** Whether the History API can be used to intercept the back gesture. */
  hasCloseWatcher: boolean;
  /** Whether the app can be offline-capable at all. */
  hasServiceWorker: boolean;
  /** The user prefers less motion. Honoured, not overridden. */
  reducedMotion: boolean;
  prefersDark: boolean;
  /** Whether the device reports a display cutout region. */
  hasSafeArea: boolean;
};

function media(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try { return window.matchMedia(query).matches; } catch { return false; }
}

/** Read the safe-area insets the CSS environment reports. */
export function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof window === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  try {
    const probe = document.createElement("div");
    probe.style.cssText = [
      "position:fixed", "top:0", "left:0", "width:0", "height:0", "visibility:hidden",
      "padding-top:env(safe-area-inset-top, 0px)",
      "padding-right:env(safe-area-inset-right, 0px)",
      "padding-bottom:env(safe-area-inset-bottom, 0px)",
      "padding-left:env(safe-area-inset-left, 0px)",
    ].join(";");
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    const insets = {
      top: parseFloat(computed.paddingTop) || 0,
      right: parseFloat(computed.paddingRight) || 0,
      bottom: parseFloat(computed.paddingBottom) || 0,
      left: parseFloat(computed.paddingLeft) || 0,
    };
    probe.remove();
    return insets;
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export function detectCapabilities(): PlatformCapabilities {
  if (typeof window === "undefined") {
    return {
      touch: false, anyTouch: false, pointer: "unknown", standalone: false, displayMode: "unknown",
      canPromptInstall: false, hasVisualViewport: false, hasCloseWatcher: false, hasServiceWorker: false,
      reducedMotion: false, prefersDark: true, hasSafeArea: false,
    };
  }

  const pointer: PointerKind = media("(pointer: none)") ? "none"
    : media("(pointer: coarse)") ? "coarse"
    : media("(pointer: fine)") ? "fine"
    : "unknown";

  const displayMode: PlatformCapabilities["displayMode"] =
    media("(display-mode: standalone)") ? "standalone"
    : media("(display-mode: fullscreen)") ? "fullscreen"
    : media("(display-mode: minimal-ui)") ? "minimal-ui"
    : media("(display-mode: browser)") ? "browser"
    : "unknown";

  const insets = safeAreaInsets();

  return {
    // Feature detection, not UA sniffing: does the device have a coarse primary pointer?
    touch: pointer === "coarse" || "ontouchstart" in window,
    anyTouch: media("(any-pointer: coarse)"),
    pointer,
    standalone: displayMode === "standalone" || displayMode === "fullscreen"
      // iOS reports it through a non-standard flag and never fires the install event.
      || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    displayMode,
    canPromptInstall: "onbeforeinstallprompt" in window,
    hasVisualViewport: "visualViewport" in window && window.visualViewport !== null,
    hasCloseWatcher: typeof (window as Window & { CloseWatcher?: unknown }).CloseWatcher === "function",
    hasServiceWorker: "serviceWorker" in navigator,
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    prefersDark: media("(prefers-color-scheme: dark)"),
    hasSafeArea: insets.top > 0 || insets.bottom > 0 || insets.left > 0 || insets.right > 0,
  };
}

/** The current visual viewport height, which shrinks when a software keyboard opens. */
export function visualViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

/**
 * Watch for the software keyboard opening.
 *
 * On Android the page's `interactive-widget` policy decides whether the visual viewport
 * shrinks at all; on iOS it always does. So this reports what it observes and the caller
 * degrades to no adjustment when the height does not change.
 */
export function observeKeyboard(onChange: (open: boolean, height: number) => void): () => void {
  if (typeof window === "undefined" || !window.visualViewport) return () => undefined;
  const viewport = window.visualViewport;
  const baseline = viewport.height;
  const handler = () => {
    const shrink = baseline - viewport.height;
    // A quarter of the viewport is a deliberate threshold: small changes are URL-bar
    // movement, not a keyboard.
    onChange(shrink > baseline * 0.25, Math.max(0, shrink));
  };
  viewport.addEventListener("resize", handler);
  return () => viewport.removeEventListener("resize", handler);
}

/** Whether the app is currently visible. Used to pause polling rather than guess. */
export function observeVisibility(onChange: (visible: boolean) => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const handler = () => onChange(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

/** Which CSS breakpoint the window is at. Reported as a name, not a pixel width. */
export type Breakpoint = "compact" | "medium" | "expanded";

export function currentBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "expanded";
  const width = window.innerWidth;
  if (width < 640) return "compact";
  if (width < 1024) return "medium";
  return "expanded";
}

export function observeBreakpoint(onChange: (breakpoint: Breakpoint) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  let last = currentBreakpoint();
  const handler = () => {
    const next = currentBreakpoint();
    if (next !== last) { last = next; onChange(next); }
  };
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}

/**
 * The minimum touch target, in CSS pixels.
 *
 * WCAG 2.2 AA requires 24×24; Apple and Material ask for 44 and 48. We use 44, because
 * the platform is used on tablets in the field and an undersized target is a real
 * usability failure rather than a rounding error.
 */
export const MIN_TOUCH_TARGET = 44;
