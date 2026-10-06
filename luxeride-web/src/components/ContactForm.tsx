"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The message box on `/contact` (`trust-and-policies` §6.4).
 *
 * A Client Component island inside a Server Component page, and the ONLY client
 * code on the route. It has no server write, no database and no mail service, so
 * the page cannot fail because a third party is down — the message is composed in
 * the browser and handed to WhatsApp, which is the channel the business actually
 * answers on.
 *
 * WHY IT STILL EXISTS WHEN A `wa.me` BUTTON WOULD DO
 *
 * A bare WhatsApp button sends a fixed sentence. A customer who has a question
 * about a specific car gets to write it down here, see exactly what will be sent,
 * and edit it — which is the same "no surprises in the handoff" principle the
 * checkout uses.
 *
 * THE FAILURE PATH IS A LINK, NOT AN ERROR
 *
 * If `window.open` is blocked by a popup blocker, the anchor below is still a real
 * `href` and works on a second tap. That is deliberate: the message is the whole
 * point of the page, so it must never depend on a popup succeeding.
 */

const SUBJECTS = [
  "A question about a product",
  "Does it fit my car?",
  "An existing order",
  "Delivery and timing",
  "Something else",
] as const;

export default function ContactForm() {
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [message, setMessage] = useState("");

  const composed = [
    `Hi! ${subject}.`,
    message.trim() ? `\n${message.trim()}` : "",
    "\nThanks!",
  ]
    .join("")
    .trim();

  const href = whatsappLink(composed);

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label
          htmlFor="contact-subject"
          className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted"
        >
          What is this about?
        </label>
        <select
          id="contact-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm focus:border-accent focus:outline-none"
        >
          {SUBJECTS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted"
        >
          Your message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          placeholder="Tell us the car and year if it is a fit question, e.g. 2015 Toyota Camry."
          className="w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface/60 p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-fg-muted">
          This is what we will receive
        </p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-fg/90">{composed}</pre>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block w-full rounded-xl bg-accent px-5 py-3.5 text-center text-sm font-semibold text-on-accent"
      >
        Send on WhatsApp
      </a>
    </div>
  );
}
