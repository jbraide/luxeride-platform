"use client";

import { useEffect, useState } from "react";

import { flashMessage } from "../app/admin/(console)/flash-messages";

/**
 * The admin's one notice, and the only Client Component in the console.
 *
 * ── WHY THIS ONE IS A CLIENT COMPONENT, WHEN THE WHOLE CONSOLE IS SERVER-RENDERED ──
 *
 * The owner's requirement, 2026-10-05: "banner error and success message should timeout
 * and not just be on screen". Timing something OUT is not a thing HTML can do — a
 * server-rendered banner has no clock, so it stays until the page is left.
 *
 * That is the whole cost, and it is worth naming rather than discovering: the console
 * has had no `'use client'` anywhere since it was built, and every action has worked as
 * a plain `<form method="post">` with scripting disabled. This component does NOT break
 * that. The server still renders the notice, the dismiss is still a LINK to
 * `/admin/flash/clear`, and every form still submits without JavaScript — the only
 * thing JavaScript adds here is that the notice goes away on its own.
 *
 * If the script fails to load, the notice behaves exactly as it did before this change.
 * That is the property worth protecting, and it is why the dismiss remains a link.
 *
 * ── WHY THE SERVER SENDS THE MESSAGE AS A PROP RATHER THAN THE CLIENT READING A COOKIE ──
 *
 * Because a client component cannot read an httpOnly cookie, and because the whole
 * message table lives in one module that the server already imports. Passing the
 * resolved SENTENCE means the client never has to know the vocabulary, and a typo in a
 * flash key degrades to "no notice" rather than to an unstyled object.
 */

/** How long a notice stays before it removes itself. */
const SUCCESS_MS = 5000;
/** Errors linger longer: something refused is worth reading twice. */
const ERROR_MS = 12000;

export default function AdminNotice({
  flashKey,
  currentPath,
}: {
  /** The flash key, or null. Resolved by `flashMessage()` on the server. */
  flashKey: string | null;
  currentPath: string;
}) {
  const message = flashMessage(flashKey);

  /**
   * WHICH NOTICE IS SHOWING, DERIVED RATHER THAN RESET IN AN EFFECT.
   *
   * The first version put `setVisible(Boolean(message))` at the top of the effect, and
   * `react-hooks/set-state-in-effect` was right: a second render to express something
   * the previous state already implied.
   *
   * Instead the hidden-until timer is keyed by the flash key. A new notice is a new
   * key, so it starts visible and arms a fresh timer; the same key re-rendering is not
   * a change at all. No reset, no cascade.
   */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visible = dismissed !== (flashKey ?? null);

  useEffect(() => {
    if (!message) return;
    // Errors stay twice as long. A success is a receipt; a refusal is an instruction.
    const isRefusal = message.toLowerCase().includes("refus") || message.includes("?");
    const timer = window.setTimeout(
      () => setDismissed(flashKey),
      isRefusal ? ERROR_MS : SUCCESS_MS,
    );
    return () => window.clearTimeout(timer);
    // Re-arming on a new key is the point: two saves in a row each get their own
    // timer, rather than the second being swallowed by the first's cleanup.
  }, [flashKey, message]);

  if (!message || !visible) return null;

  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
      <span aria-hidden className="mt-0.5 text-sm text-accent">
        ●
      </span>
      <p role="status" className="flex-1 text-sm leading-relaxed text-fg/85">
        {message}
      </p>
      <a
        href={`/admin/flash/clear?next=${encodeURIComponent(currentPath)}`}
        className="shrink-0 text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
      >
        Dismiss
      </a>
    </div>
  );
}
