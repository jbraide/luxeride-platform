"use client";

import { useEffect, useState } from "react";

/**
 * THE CONSOLE'S ONE ALERT, IN THE CORNER.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 *
 * Two blocks used to sit at the TOP of the content column, in the page's own flow:
 * `AdminNotice` for a success ("Saved…") and `FieldErrors` for a refusal ("Not saved. 2
 * fields refused…"). The owner's words: "the alert should be the one at the top right
 * corner that goes away not always at the top of the page." So both now float as one
 * toast, fixed to the top-right, and remove themselves.
 *
 * ── WHY ONE COMPONENT AND NOT TWO ────────────────────────────────────────────
 *
 * They shared a position, so two of them could overlap: a success receipt lingers for a
 * few seconds, and a refusal in that window would land on top of it. One component with
 * two shapes cannot overlap itself, and a refusal deliberately wins over a stale receipt.
 *
 * ── WHY THE MESSAGES ARRIVE RESOLVED ─────────────────────────────────────────
 *
 * The server does the looking-up — `flashMessage(key)` and `messageFor(code)` — and hands
 * down plain sentences. A client component cannot read an httpOnly cookie, and passing a
 * function across the boundary is not allowed, so the vocabulary stays on the server and
 * a typo in a code degrades to a fixed sentence rather than a blank box.
 *
 * ── AND THE CONSOLE STILL WORKS WITHOUT JAVASCRIPT ───────────────────────────
 *
 * This is a Client Component, but it server-renders to real markup, so with scripting off
 * the alert is still on screen and the dismiss is still a LINK to `/admin/flash/clear`.
 * All JavaScript adds is that the toast removes ITSELF. That property is the reason the
 * dismiss remains a link rather than a button.
 */

/** How long a success stays before it removes itself. */
const SUCCESS_MS = 5000;
/** Refusals linger longer: a receipt is a glance, a refusal is an instruction. */
const ERROR_MS = 12000;

export interface ToastError {
  /** The field the refusal names, or `""` for a page-level refusal with no field. */
  field: string;
  /** The resolved sentence, from the guard's own `messageFor`. */
  message: string;
}

export default function AdminToast({
  notice,
  errors,
  currentPath,
}: {
  /** The success sentence, or null. Resolved by `flashMessage()` on the server. */
  notice: string | null;
  /** Refusals for this render, resolved on the server. Empty when there are none. */
  errors: readonly ToastError[];
  /** Where the dismiss link returns to. The query is already stripped. */
  currentPath: string;
}) {
  const failing = errors.length > 0;

  /**
   * WHICH TOAST IS SHOWING, DERIVED FROM A SIGNATURE RATHER THAN RESET IN AN EFFECT.
   *
   * A new message is a new signature, so it starts visible and arms a fresh timer; the
   * same signature re-rendering is not a change at all. This is the shape `AdminNotice`
   * used, kept because a `setState` in an effect to express something the render already
   * implies is the pattern the linter is right to reject.
   */
  const signature = failing
    ? `e:${errors.map((error) => `${error.field}:${error.message}`).join("|")}`
    : notice
      ? `n:${notice}`
      : null;

  const [dismissed, setDismissed] = useState<string | null>(null);
  const visible = signature !== null && dismissed !== signature;

  useEffect(() => {
    if (signature === null) return;
    const timer = window.setTimeout(() => setDismissed(signature), failing ? ERROR_MS : SUCCESS_MS);
    return () => window.clearTimeout(timer);
    // Re-arming on a new signature is the point: two saves in a row each get their own
    // timer rather than the second being swallowed by the first's cleanup.
  }, [signature, failing]);

  if (signature === null || !visible) return null;

  return (
    // Centred on the narrowest screens, pinned to the corner above `sm`. `pointer-events-none`
    // on the lane means the toast never sits over a control it is not covering visually.
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:justify-end sm:px-0">
      <div
        role={failing ? "alert" : "status"}
        className={`pointer-events-auto w-full max-w-sm rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg ${
          failing ? "border-danger" : "border-accent/40"
        }`}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className={`mt-0.5 text-sm ${failing ? "text-danger" : "text-accent"}`}>
            ●
          </span>
          <div className="flex-1">
            {failing ? (
              <>
                <p className="font-medium text-danger">
                  Not saved. {errors.length} field{errors.length === 1 ? "" : "s"} refused:
                </p>
                <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-fg/80">
                  {errors.map((error, index) => (
                    <li key={`${error.field}-${index}`}>
                      {error.field !== "" && (
                        <span className="font-mono text-fg/70">{error.field} — </span>
                      )}
                      {error.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="leading-relaxed text-fg/85">{notice}</p>
            )}
          </div>
          <a
            href={`/admin/flash/clear?next=${encodeURIComponent(currentPath)}`}
            className="shrink-0 text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
          >
            Dismiss
          </a>
        </div>
      </div>
    </div>
  );
}
