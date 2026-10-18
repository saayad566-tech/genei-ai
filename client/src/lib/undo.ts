import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Undo and redo for destructive actions.
 *
 * Users will delete the wrong thing; that is not a failure of the user, it is a fact
 * about software. This keeps a bounded history of reversible operations, with the inverse
 * captured at the moment of the action rather than reconstructed later — reconstructing
 * an inverse after the fact is how undo silently does the wrong thing.
 *
 * Bounded, because an unbounded undo stack is a memory leak, and coalesced by label, so
 * ten rapid keystroke-level changes become one undo step rather than ten.
 */

export type UndoableAction = {
  /** Shown to the user, e.g. "Delete project". */
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
};

type Entry = UndoableAction & { at: number };

export type UndoController = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  /** Record an action that has already been performed. */
  push: (action: UndoableAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  depth: { undo: number; redo: number };
};

export function useUndoRedo(options: { limit?: number; coalesceMs?: number } = {}): UndoController {
  const limit = options.limit ?? 50;
  const coalesceMs = options.coalesceMs ?? 600;
  const past = useRef<Entry[]>([]);
  const future = useRef<Entry[]>([]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const push = useCallback(
    (action: UndoableAction) => {
      const now = Date.now();
      const last = past.current[past.current.length - 1];
      // Rapid actions with the same label collapse into one step: a user who nudges a
      // value ten times expects one undo, not ten.
      if (last && last.label === action.label && now - last.at < coalesceMs) {
        past.current[past.current.length - 1] = { ...action, at: now };
      } else {
        past.current.push({ ...action, at: now });
        if (past.current.length > limit) past.current.splice(0, past.current.length - limit);
      }
      // A new action invalidates the redo branch, as everywhere else.
      future.current = [];
      bump();
    },
    [coalesceMs, limit, bump],
  );

  const undo = useCallback(async () => {
    const entry = past.current.pop();
    if (!entry) return;
    try {
      await entry.undo();
      future.current.push(entry);
    } catch {
      // Put it back if the undo itself failed, so the history stays truthful.
      past.current.push(entry);
    }
    bump();
  }, [bump]);

  const redo = useCallback(async () => {
    const entry = future.current.pop();
    if (!entry) return;
    try {
      await entry.redo();
      past.current.push(entry);
    } catch {
      future.current.push(entry);
    }
    bump();
  }, [bump]);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    bump();
  }, [bump]);

  void version;
  return {
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current[past.current.length - 1]?.label,
    redoLabel: future.current[future.current.length - 1]?.label,
    push,
    undo,
    redo,
    clear,
    depth: { undo: past.current.length, redo: future.current.length },
  };
}

/* ------------------------------------------------------------------ *
 * Keyboard shortcuts
 * ------------------------------------------------------------------ */

export type Shortcut = {
  /** e.g. "mod+k", "mod+shift+z", "escape", "mod+/". */
  keys: string;
  label: string;
  run: (event: KeyboardEvent) => void;
  /** Do not fire while the user is typing into a field. Defaults to true. */
  ignoreInInputs?: boolean;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** Render a shortcut for display, with the right modifier for the platform. */
export function formatShortcut(keys: string): string {
  return keys
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "mod") return IS_MAC ? "⌘" : "Ctrl";
      if (lower === "shift") return IS_MAC ? "⇧" : "Shift";
      if (lower === "alt") return IS_MAC ? "⌥" : "Alt";
      if (lower === "escape") return "Esc";
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(IS_MAC ? "" : "+");
}

function matches(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split("+");
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");
  const key = parts.filter((part) => !["mod", "shift", "alt"].includes(part))[0];

  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  if (needsMod !== modPressed) return false;
  if (needsShift !== event.shiftKey) return false;
  if (needsAlt !== event.altKey) return false;
  return event.key.toLowerCase() === key;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}

/**
 * Register a set of shortcuts.
 *
 * One listener for all of them rather than one each: a dozen separate keydown listeners
 * is a dozen functions running on every keystroke, which is exactly the kind of thing
 * that makes typing feel heavy.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true): void {
  const ref = useRef(shortcuts);
  useEffect(() => { ref.current = shortcuts; }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of ref.current) {
        if (!matches(event, shortcut.keys)) continue;
        if ((shortcut.ignoreInInputs ?? true) && isTypingTarget(event.target)) continue;
        event.preventDefault();
        shortcut.run(event);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
