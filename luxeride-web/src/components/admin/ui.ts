/**
 * THE CONSOLE'S SHARED CLASS STRINGS.
 *
 * Every screen in `/admin` hand-rolled its own `label`, `input`, `fieldFailed` and
 * "Not saved" block. That is how six screens came to hold six slightly different ideas
 * of what an input, a warning and a section heading look like — and it is why the
 * warning colour was a `#FF6B35` literal in dozens of places instead of one token.
 *
 * These are those strings, once. A change to the console's look is now a change here,
 * not a grep across eleven files. They are class strings and not components on purpose:
 * the console is server-rendered with no `'use client'`, and the markup around each
 * control differs enough (a field in a grid, a button that overrides `formAction`, a
 * chip that is a `<Link>`) that a component would fight the call sites more than it
 * would help them.
 *
 * ── WHY THE CLASSES NAME TOKENS AND NOT HEX ─────────────────────────────────────
 *
 * `text-danger`, `border-border`, `bg-surface` — never `#FF6B35`. The danger colour is
 * the one that used to be a literal everywhere, and the literal fails WCAG AA on the
 * light theme's off-white; the token steps it down in light mode and leaves dark mode
 * exactly as it was.
 */

/* ── Page chrome ───────────────────────────────────────────────────────────── */

/** The page's `<h1>`-equivalent. One per screen. */
export const PAGE_TITLE = "font-display text-xl font-semibold";
/** The one-line "what this screen is" under the title. */
export const PAGE_META = "mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted";

/** A section heading inside a page. */
export const SECTION_TITLE = "font-display text-base font-semibold";
/** The explanatory line under a section heading. Bounded width, so it stays readable. */
export const SECTION_HINT = "mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted";

/** The small uppercased label used above figures, group headings and inline stats. */
export const EYEBROW = "font-mono text-[10px] uppercase tracking-widest text-accent-dim";

/* ── Surfaces ──────────────────────────────────────────────────────────────── */

/** A raised panel. Pair with `CARD_PAD` where the content does not bring its own. */
export const CARD = "rounded-xl border border-border bg-surface/60";
export const CARD_PAD = "px-5 py-5";
/** A quieter inset used for empty states and inline notices inside a card. */
export const INSET = "rounded-lg border border-border bg-surface px-4 py-3";

/* ── Form controls ─────────────────────────────────────────────────────────── */

/** A field label. Sentence case in the copy, uppercased by the class. */
export const LABEL = "block text-xs uppercase tracking-widest text-accent-dim";
/** The shared text input / select / number field. */
export const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors placeholder:text-fg-muted focus:border-accent";
/** Added to `INPUT` when the field has been refused. */
export const INPUT_BAD = "border-danger";
/** The message under a refused field. */
export const FIELD_ERROR = "mt-1 text-xs leading-relaxed text-danger";
/** Helper text under a field that is not an error. */
export const HINT = "mt-1 text-[11px] leading-relaxed text-fg-muted";

/** The class for an input the server refused, or `""` when it is fine. */
export function inputState(failed: boolean): string {
  return failed ? INPUT_BAD : "";
}

/* ── Buttons ───────────────────────────────────────────────────────────────── */

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";

/** The one filled action on a screen. */
export const BTN_PRIMARY = `${BTN_BASE} border border-accent bg-accent px-4 py-2 text-on-accent hover:bg-accent/90`;
/** A normal, non-destructive action beside a primary one. */
export const BTN_SECONDARY = `${BTN_BASE} border border-border px-4 py-2 text-fg hover:border-accent hover:text-accent`;
/** A destructive action. Names the consequence; never the only way to do a safe thing. */
export const BTN_DANGER = `${BTN_BASE} border border-danger/60 px-4 py-2 text-danger hover:bg-danger hover:text-on-accent`;
/** A dense control that lives in a table row or a toolbar. */
export const BTN_ROW = `${BTN_BASE} border border-border px-3 py-1 text-xs text-fg-muted hover:border-accent hover:text-accent`;
/** A text-only action that takes no space until hovered. */
export const BTN_GHOST =
  "text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-45";

/* ── Filter chips ──────────────────────────────────────────────────────────── */

/**
 * A filter chip. The same shape on every list screen, with `aria-current="page"` on the
 * active one — a chip states the filter and its count, and that is what the call site
 * puts inside it.
 */
export function chip(active: boolean): string {
  return `flex items-baseline gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-fg-muted hover:border-accent/50 hover:text-accent"
  }`;
}

/**
 * THE SMART TABLE, SHARED. Numbers right-aligned and tabular so columns line up; text
 * left. Used by the list screens so they cannot disagree about which side a figure sits.
 */
export const TABLE = "w-full text-left text-sm";
export const TABLE_HEAD =
  "border-b border-border font-mono text-[11px] uppercase tracking-widest text-accent-dim";
export const TABLE_HEAD_CELL = "py-2 pr-4 font-normal";
export const TABLE_ROW = "border-t border-border align-top";
export const NUM = "tabular text-right";
