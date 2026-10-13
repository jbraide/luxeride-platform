"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that shows the form is working.
 *
 * ── THE PROBLEM IT SOLVES ────────────────────────────────────────────────────
 *
 * Every console screen submits a plain `<form action={serverAction}>`, and the action
 * round-trips to Postgres before anything on the page moves. Nothing on screen said so:
 * you pressed Save (or Withdraw, or Apply) and the page sat there until it reloaded. If
 * the action was slow you could not tell a slow save from a dead one, and the honest
 * temptation was to press it again. This is the missing feedback.
 *
 * ── WHY IT IS A CLIENT COMPONENT IN A CONSOLE THAT AVOIDS THEM ───────────────
 *
 * `useFormStatus` is the only supported way to read a form's pending state, and it needs
 * a Client Component inside the form. That is the entire reason this file exists.
 *
 * IT DOES NOT COST THE CONSOLE ITS SCRIPTING-OFF GUARANTEE. A Client Component still
 * server-renders to real HTML, so with JavaScript off this is an ordinary
 * `<button type="submit">` and the form posts exactly as it did before — Next's
 * progressive enhancement. The spinner and the disable only appear when scripting is on,
 * which is precisely when they are useful.
 *
 * ── WHY IT TRACKS "PRESSED", NOT MERELY "PENDING" ─────────────────────────────
 *
 * A form can hold several submit buttons — Save, Withdraw and Delete share one form on
 * the delivery screen. `useFormStatus` reports pending for the WHOLE form, so a naive
 * button would spin on all three at once and the operator could not tell which one they
 * pressed. Remembering the click means the pressed button shows the spinner while its
 * siblings merely disable, which is both honest and what stops a double-submit.
 */
interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export default function SubmitButton({
  children,
  className = "",
  onClick,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState(false);

  // The spinner belongs to the button that was actually pressed. `busy` gates the
  // spinner on BOTH, so an action that resolves without navigating cannot leave a
  // spinner stuck on: `pending` falls back to false and the button re-enables.
  const busy = pending && pressed;

  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={busy || undefined}
      className={className}
      onClick={(event) => {
        setPressed(true);
        onClick?.(event);
      }}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** A quiet inline spinner, sized to sit beside a button's label without shifting it. */
function Spinner() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 animate-spin">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
