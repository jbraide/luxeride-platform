"use client";

import { useActionState } from "react";

import { verifyOrderAccess, type AccessResult } from "./verify";

/**
 * The phone prompt on `/order/<reference>` — `commerce-backend` §7.2,
 * `cart-checkout` requirement 5.
 *
 * WHY A CLIENT COMPONENT AT ALL
 *
 * The action itself is a Server Action and needs no client code to run; a plain
 * `<form action={…}>` would submit and re-render on its own. `useActionState`
 * is here for two things the bare form cannot give: the `pending` flag, so the
 * button can say it is checking and cannot be pressed twice, and the `error`
 * slot, so a wrong number is announced in the page rather than by a full reload.
 *
 * WHAT IT SAYS WHEN THE NUMBER IS WRONG
 *
 * "That number did not match" — and nothing else. It does not say the reference
 * exists, and the message it shows is the one an unknown reference produces too.
 * That equivalence is the whole privacy property of this page, and it lives in
 * `./page.tsx`; this component only has to avoid undoing it by being chatty.
 */
export default function OrderAccessForm({ reference }: { reference: string }) {
  // The action takes `(reference, formData)` — the reference is a prop of this
  // component, not a form field — so it is bound here rather than posted.
  const [state, formAction, pending] = useActionState<AccessResult, FormData>(
    async (_previous, formData) => verifyOrderAccess(reference, formData),
    { verified: false },
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="order-access-phone"
          className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted"
        >
          WhatsApp number on the order
        </label>
        <input
          id="order-access-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          maxLength={32}
          autoComplete="tel"
          placeholder="e.g. 0704 962 1694"
          aria-invalid={state.verified === false && state.error === true}
          className="w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
        />
      </div>

      {state.error === true && (
        <p role="alert" className="text-xs text-[#FF6B35]">
          That number did not match. Check it and try again, or message us on WhatsApp with the reference.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gold px-5 py-3.5 text-sm font-semibold text-ink disabled:opacity-60"
      >
        {pending ? "Checking…" : "Show my order"}
      </button>
    </form>
  );
}