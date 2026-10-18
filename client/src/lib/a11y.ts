/**
 * Accessibility primitives.
 *
 * These are the things that make the app usable by keyboard and by assistive technology,
 * and they are not optional extras: a modal that does not trap focus, or an error that is
 * not announced, is broken for a real group of people.
 *
 * Built on the platform rather than a library, so the same code serves the desktop and
 * the Android build without adding a runtime.
 */

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    // Deliberately NOT filtering on `offsetParent`: it is null for every `position: fixed`
    // element, which is exactly what a modal is. Filtering on it would exclude the
    // elements this function exists to find. Hidden and disabled are the reliable signals.
    if (element.hasAttribute("hidden")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    if ((element as HTMLButtonElement).disabled) return false;
    return true;
  });
}

/**
 * Keep focus inside an element until it is released.
 *
 * A modal that lets Tab escape to the page behind it is a trap for a screen-reader user:
 * they end up somewhere they cannot see, with no way back. Focus is restored to whatever
 * was focused before, because closing a dialog should put you back where you were.
 */
export function trapFocus(container: HTMLElement): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusable = focusableWithin(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener("keydown", onKeyDown);
  // Move focus in if it is not already inside.
  if (!container.contains(document.activeElement)) {
    const first = focusableWithin(container)[0];
    first?.focus();
  }

  return () => {
    container.removeEventListener("keydown", onKeyDown);
    previouslyFocused?.focus?.();
  };
}

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

/**
 * A polite live region for screen readers.
 *
 * A visually obvious change — a spinner becoming a result — is invisible to someone who
 * cannot see it. This is how the app says "that finished" out loud.
 */
class Announcer {
  private polite: HTMLElement | null = null;
  private assertive: HTMLElement | null = null;

  private region(kind: "polite" | "assertive"): HTMLElement | null {
    if (typeof document === "undefined") return null;
    const existing = document.getElementById(`genei-announce-${kind}`);
    if (existing) return existing;
    const element = document.createElement("div");
    element.id = `genei-announce-${kind}`;
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", kind);
    element.setAttribute("aria-atomic", "true");
    // Visually hidden but present in the accessibility tree.
    element.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    document.body.appendChild(element);
    return element;
  }

  announce(message: string, kind: "polite" | "assertive" = "polite"): void {
    const region = this.region(kind);
    if (!region) return;
    // Clearing first makes a repeated identical message announce again.
    region.textContent = "";
    window.setTimeout(() => { region.textContent = message; }, 50);
  }
}

export const announcer = new Announcer();

/** Announce a change to assistive technology. */
export function announce(message: string, kind: "polite" | "assertive" = "polite"): void {
  announcer.announce(message, kind);
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

/**
 * Move focus to a heading after a route change.
 *
 * Without this, a keyboard user navigates to a new page and their focus is still on the
 * link they left from, somewhere in the middle of a page they can no longer see.
 */
export function focusMainContent(): void {
  if (typeof document === "undefined") return;
  const main = document.querySelector<HTMLElement>("main, [role='main'], #main-content");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: false });
}

/** Arrow-key navigation for a group of elements, as tabs and menus expect. */
export function rovingTabIndex(container: HTMLElement, itemSelector: string): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    event.preventDefault();

    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % items.length;
    else next = (current - 1 + items.length) % items.length;

    items.forEach((item, index) => { item.tabIndex = index === next ? 0 : -1; });
    items[next]?.focus();
  };
  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}
