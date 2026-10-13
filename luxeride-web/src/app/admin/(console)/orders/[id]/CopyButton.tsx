"use client";

import { useState } from "react";

/**
 * Copy one string to the clipboard, from a Server Component's page.
 *
 * ── WHY THIS IS A CLIENT COMPONENT, IN A CONSOLE THAT HAS ALMOST NONE ────────
 *
 * The console's shell explains that it has no `'use client'` anywhere, and that is
 * true of every screen with a FORM — because a form must work with scripting off,
 * and a Server Action does. This button is one of the documented exceptions, beside
 * `SubmitButton` and `AdminToast`: the clipboard is a browser API with no server
 * equivalent, so copying the WhatsApp message a customer will send cannot be done
 * from the server. (The same description used to name `AdminNotice`, which the corner
 * alert replaced.)
 *
 * ── WHY IT DOES NOT REPLACE ANYTHING ─────────────────────────────────────────
 *
 * It is an ACCELERATOR, not the mechanism. The order screen renders the full message
 * in a read-only `<textarea>`, so a person with JavaScript disabled (or with the
 * clipboard API blocked) can still select it and copy by hand — the button saves a
 * keystroke and adds no capability the page did not already have. That is the line
 * that keeps the console's no-JS promise intact: an enhancement may exist, a
 * REQUIREMENT may not depend on it.
 *
 * `navigator.clipboard` is undefined on an insecure origin and can be refused by the
 * user, so both are handled by doing nothing visible — the text is on screen either
 * way, and a fake "Copied" would be a lie.
 */
export default function CopyButton({ text, label = "Copy message" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable. The textarea beside this button is the fallback.
        }
      }}
      className="rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:border-accent hover:text-accent"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
