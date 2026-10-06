"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark toggle.
 *
 * WHY `useSyncExternalStore` AND NOT `useState` + `useEffect`
 *
 * The obvious implementation reads `document.documentElement.dataset.theme` in an
 * effect and puts it in state. That is a cascading render — a second pass after the
 * first paint — and `react-hooks/set-state-in-effect` refuses it, correctly. The rule
 * fired on the first draft of this file.
 *
 * `useSyncExternalStore` is the right tool and the codebase already uses it for
 * `useHasMounted`: React uses the SERVER snapshot during hydration and the client
 * snapshot immediately after, which is exactly the semantics here, with no effect and
 * no flash.
 *
 * WHY THE THEME IS ALREADY CORRECT BEFORE THIS COMPONENT RUNS
 *
 * An inline script in the root layout read the stored value and set `data-theme` on
 * `<html>` before first paint — see the comment there. So this component does not
 * apply a theme; it only reads the one already applied and offers to change it. That
 * is why it does not need to write anything on mount, which is the effect that was
 * being removed.
 *
 * IT REMEMBERS, AND IT FOLLOWS THE OS UNTIL THE USER SAYS OTHERWISE
 *
 * With no stored preference the site matches `prefers-color-scheme`, and keeps
 * matching it — so a visitor whose system flips at sunset sees the site follow. Once
 * they choose, that wins permanently: the media listener is only attached when there
 * is no stored value, so a system change can never overwrite a decision the visitor
 * actually made.
 *
 * THE BUTTON IS A BUTTON WITH A LABEL
 *
 * It is the only control on the site with no visible text, so it carries an
 * `aria-label` that says what pressing it does. The glyph is `aria-hidden`: announcing
 * "sun" tells a screen-reader user nothing about the action.
 */

/** Everyone currently rendering a theme. Module-scoped so the store is shared. */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Subscribe to theme changes.
 *
 * The `matchMedia` listener is attached ONLY while there is no stored preference —
 * that single condition is the whole of the "respects an explicit choice" behaviour,
 * and putting it here rather than in an effect means it cannot drift out of step with
 * the toggle.
 */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("luxeride-theme");
  } catch {
    stored = null;
  }

  let media: MediaQueryList | undefined;
  if (stored !== "light" && stored !== "dark" && window.matchMedia) {
    media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", onChange);
  }

  return () => {
    listeners.delete(onChange);
    media?.removeEventListener("change", onChange);
  };
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * The server has no document and does not know the visitor's preference, so it renders
 * dark. React hydrates with this and then immediately re-renders with the real
 * snapshot — the sanctioned path, and no worse than a single icon resolving a frame
 * later.
 */
function getServerSnapshot(): "light" | "dark" {
  return "dark";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle(): void {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("luxeride-theme", next);
    } catch {
      // Private browsing can refuse to store. The theme still switched; it just will
      // not be remembered — a far better failure than refusing to switch at all.
    }
    // Every other mounted toggle follows.
    emit();
  }

  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span aria-hidden className="text-sm leading-none">
        {theme === "light" ? "☾" : "☀"}
      </span>
    </button>
  );
}