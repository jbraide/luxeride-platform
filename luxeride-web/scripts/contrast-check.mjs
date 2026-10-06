#!/usr/bin/env node
/**
 * `scripts/contrast-check.mjs` — the tokens and the classes that go with them.
 *
 * WHAT IT CATCHES, and why each one is here rather than in review
 *
 * 1. **A CLASS NAMING A TOKEN THAT NO LONGER EXISTS.** The palette was renamed on
 *    2026-10-04 from `--ink`/`--gold`/`--panel` to `--bg`/`--accent`/`--surface` when
 *    light mode arrived. A class like `bg-panel` then does not fail — Tailwind v4
 *    simply emits nothing for it, and the element silently loses its background. That
 *    is the dangerous shape: a missing utility and a deliberately absent one look
 *    identical in the output.
 *
 * 2. **`text-white` AND `text-ink`,** which are the two that FAIL SILENTLY IN THE OTHER
 *    DIRECTION. Both are real Tailwind classes, so they keep working — and both force a
 *    fixed colour onto an element whose background now comes from a theme variable.
 *    White text on the light theme's surface is invisible, and it is invisible while
 *    looking like it rendered.
 *
 * 3. **TEXT ON AN ACCENT BACKGROUND THAT IS NOT `--on-accent`.** This is the one that
 *    actually shipped broken: the gold buttons said `text-ink` before the theme split
 *    (meaning "dark text on a light gold button"), the sweep rewrote it to `text-fg`
 *    (the page foreground), and every gold button went light-on-light in dark mode and
 *    DARK-ON-DARK in light mode. Twenty-nine elements, unreadable in both themes, and
 *    only visible by looking at the page.
 *
 * WHY A SCRIPT AND NOT JUST CARE
 *
 * Because all three are invisible to a type-checker and invisible to a linter — they are
 * valid Tailwind, valid JSX, and simply wrong. The only thing that catches them is
 * something that knows the token list.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = path.join(ROOT, "src", "app", "globals.css");
const SRC = path.join(ROOT, "src");

/** The colour utilities `@theme inline` actually defines, read from the stylesheet. */
const defined = new Set(
  [...fs.readFileSync(CSS, "utf8").matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]),
);

/** Every colour utility the rename retired. A class naming one of these is dead. */
const RETIRED = [
  "ink",
  "panel",
  "panel-2",
  "gold",
  "gold-dim",
  "line",
  "muted",
];

/**
 * Fixed-colour classes that keep WORKING and are therefore the most dangerous.
 *
 * `text-white` and `text-ink` both resolve in Tailwind v4, so nothing complains. What
 * they do is pin a colour that used to mean "contrast against the accent" onto an
 * element in a themed page.
 */
const PINNED = ["text-white", "text-black"];

const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;

    const rel = path.relative(ROOT, full);
    const lines = fs.readFileSync(full, "utf8").split("\n");

    lines.forEach((line, index) => {
      const at = `${rel}:${index + 1}`;

      // ── 1 & 2: a class naming a retired token, or a pinned fixed colour ──────
      for (const match of line.matchAll(/\b(?:bg|text|border|placeholder:text|focus:border|ring|from|to|fill|stroke)-([a-z0-9][a-z0-9-]*)\b/g)) {
        const name = match[1];
        if (RETIRED.includes(name)) {
          failures.push(
            `${at}: "${name}" is not a token any more. The palette was renamed to bg/surface/fg/accent/border on 2026-10-04, and an unknown utility emits NOTHING — the element silently loses its styling.`,
          );
        }
      }

      for (const pinned of PINNED) {
        // Only a problem where the background is themed, which is everywhere except a
        // full-bleed dark section — of which there are none left.
        if (new RegExp(`\\b${pinned}\\b`).test(line)) {
          failures.push(
            `${at}: "${pinned}" pins a fixed colour on a themed page. It renders, and it is invisible in light mode. Use text-fg, or text-on-accent over a gold background.`,
          );
        }
      }

      // ── 3: text on an accent background that is not the accent's own token ──
      //
      // Only fires when the element ALSO names a text colour. A className of
      // `bg-accent` on its own is a progress bar or a rule with nothing written on it,
      // and those are correct as they are — the first version of this check flagged
      // FitFinder's progress bar, which is a gold fill and no text.
      //
      // `bg-accent/10` is excluded too: that is a WASH for text to sit on, not a solid
      // background, and `text-accent` over it is the intended pairing.
      const solidAccent = /\bbg-accent(?![/\w-])/.test(line);
      const someTextColour = /\btext-(?:fg|fg-muted|muted|ink|white|black)(?![/\w-])/.test(line);
      if (solidAccent && someTextColour && !/\btext-on-accent\b/.test(line)) {
        failures.push(
          `${at}: text on a gold background without "text-on-accent". The accent is light gold in dark mode and dark gold in light mode, so its readable partner flips — text-fg and text-ink are each unreadable on it, one per theme.`,
        );
      }
    });
  }
}

walk(SRC);

if (failures.length > 0) {
  console.error(`contrast-check: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  • ${failure}`);
  console.error(
    "\nThe palette is defined in src/app/globals.css under `@theme inline`. Semantic names:",
  );
  console.error("  bg · surface · surface-2 · fg · fg-muted · accent · accent-dim · on-accent · border");
  process.exit(1);
}

console.log(
  `contrast-check: ${defined.size} tokens defined, no retired or pinned colour classes, every gold background uses text-on-accent.`,
);
