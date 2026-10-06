"use client";

import { useCallback, useRef, useState } from "react";

import { fmtNaira } from "@/lib/pricing";

/**
 * The coupon box.
 *
 * ── WHAT IT IS ACTUALLY DOING ───────────────────────────────────────────────
 *
 * It asks `/api/discount` what the order would cost with this code, and shows the
 * answer. That is a PREVIEW, and it is labelled as one: the authoritative number is
 * computed again inside `POST /api/orders` when the order is written, from the same
 * `resolveDiscount` over the same rules.
 *
 * The component deliberately does NOT compute a discount. A saving a customer can
 * change in devtools is not a saving, and the whole no-stacking rule lives on the
 * server — so this can only display what the server said, and the code it sends with
 * the order is what gets resolved again.
 *
 * ── WHY A BUTTON RATHER THAN "APPLY ON TYPE" ─────────────────────────────────
 *
 * Because `minSubtotal` is a real rule. A code that needs a ₦100,000 order shows
 * "That code needs a larger order" on a basket that does not qualify, and the customer
 * can add something and try again. Firing a request on every keystroke would either
 * spam the endpoint or debounce into a result that is stale by the time they read it.
 *
 * ── NOTHING IS CONSUMED BY TYPING A CODE ─────────────────────────────────────
 *
 * A single-use coupon is decremented only after an order succeeds. Typing a code,
 * seeing it not work and going back costs the customer nothing — which is the same
 * reason the endpoint is a preview and not a redemption.
 */
/**
 * WHAT THE SERVER SAID THE ORDER WOULD COST.
 *
 * Reported upward rather than only rendered here, and the reason is a defect: the
 * checkout total used to know about the prepay discount and nothing else, so a customer
 * could be told "SAVE15 applied — ₦10,200 off" by this box while the total beside it
 * did not move by a naira. The coupon worked — the server charged less when the order
 * was written — and the page said it had not.
 *
 * A box that knows the discount and a total that does not is the whole bug, so the
 * number leaves this component as well as appearing in it.
 */
export interface DiscountPreview {
  /** What comes off the goods, in naira. 0 when nothing applies. */
  amountOff: number;
  /** What it was called — a coupon code or a promotion's name. Null when none. */
  label: string | null;
}

export default function CouponBox({
  lines,
  onApplied,
  onPriced,
  appliedLabel,
}: {
  /**
   * What is being discounted, as the cart has it.
   *
   * SENT AS A POST BODY, NOT A QUERY STRING. A URL carrying a basket is a URL that
   * lands in browser history, in a referrer header and in an analytics log, and this is
   * customer data.
   */
  lines: { productSlug: string; categorySlug: string; amount: number }[];
  /** Hands the accepted code up, so the order can carry it. */
  onApplied: (code: string | null) => void;
  /**
   * Reports what the server priced the order at, accepted code or not.
   *
   * Called on every successful response, so a LIVE PROMOTION reaches the checkout total
   * without the customer doing anything. That is the second half of the same defect: the
   * sitewide sale was on for months and the checkout total ignored it too.
   */
  onPriced?: (preview: DiscountPreview) => void;
  /** What is currently applied, from the parent, so the box survives a remount. */
  appliedLabel?: string | null;
}) {
  const [code, setCode] = useState("");
  /**
   * The cart this render is looking at, as a stable string.
   *
   * Declared BEFORE `apply` because that closure writes it into every message it sets —
   * it is how a message knows which basket it is talking about. See `shown` below.
   */
  const cartKey = JSON.stringify(lines);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "idle";
    text: string;
    /** The cart this message was computed against. See `cartKey` below. */
    for: string;
  }>({ tone: "idle", text: "", for: "" });
  const requestId = useRef(0);

  const apply = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed === "") {
      setMessage({ tone: "idle", text: "", for: cartKey });
      onApplied(null);
      // Zero, NOT zero-plus-prepay: the promotion that was on is no longer being
      // reported by anyone, so the caller must not keep a figure it can no longer
      // justify. It re-fetches on the next basket change.
      onPriced?.({ amountOff: 0, label: null });
      return;
    }

    // A response can arrive out of order if the customer types quickly and fires twice.
    // Only the newest request is allowed to write to state, or a slow early request
    // overwrites a fast later one with a stale "not recognised".
    const id = ++requestId.current;
    setBusy(true);
    try {
      const response = await fetch("/api/discount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines, couponCode: trimmed }),
      });
      const body = await response.json();
      if (id !== requestId.current) return;

      /*
       * REPORTED BEFORE THE REFUSAL BRANCHES.
       *
       * A refusal still priced an order: the promotion applied and the coupon did not, so
       * the total is not the undiscounted one. Returning early on a refusal and saying
       * nothing would leave the page showing a figure the server is not going to charge.
       * A network failure, by contrast, has priced nothing and reports nothing.
       */
      if (response.ok) {
        onPriced?.({
          amountOff: typeof body?.amountOff === "number" ? body.amountOff : 0,
          label: typeof body?.label === "string" ? body.label : null,
        });
      }

      if (!response.ok) {
        setMessage({
          tone: "bad",
          text: body?.error ?? "We could not check that just now.",
          for: cartKey,
        });
        onApplied(null);
        return;
      }

      if (body.couponAccepted) {
        setMessage({
          tone: "good",
          // The server echoed the NORMALISED code, so what is shown is what will be
          // looked up. "welcome5" typed in capitals by the input must not read as a
          // different code from the one being applied.
          text: `${body.normalizedCode} applied — ${fmtNaira(body.amountOff)} off.`,
          for: cartKey,
        });
        onApplied(body.normalizedCode);
      } else if (body.couponRefusal) {
        setMessage({ tone: "bad", text: body.couponMessage, for: cartKey });
        onApplied(null);
      } else {
        // No coupon applied AND no refusal: the code was valid but something better is
        // already on. Saying so is more honest than pretending the box did nothing.
        setMessage({
          tone: "bad",
          text: "That code is valid, but a better offer is already on this order.",
          for: cartKey,
        });
        onApplied(null);
      }
    } catch {
      if (id !== requestId.current) return;
      setMessage({
        tone: "bad",
        text: "We could not reach the checker. Try again in a moment.",
        for: cartKey,
      });
      onApplied(null);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [code, lines, onApplied, onPriced, cartKey]);

  /**
   * WHICH BASKET THE MESSAGE IS ABOUT.
   *
   * There is no effect clearing the message when the cart changes, and there should
   * not be: `react-hooks/set-state-in-effect` is right that reading the cart and
   * writing state afterwards is a second render for something derivable.
   *
   * Instead the message records the cart it was computed for, and is only rendered when
   * that is still the cart on screen. Change the basket and the old "WELCOME10
   * applied — ₦5,000 off" disappears by itself, because it was never true of the new
   * one — and it is exactly as true as it was the moment before.
   */
  const shown = message.for === cartKey ? message : { tone: "idle" as const, text: "" };

  // A constant, not derived state. Declared `const` deliberately.
  const inputId: string = "coupon-code";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor={inputId} className="block text-xs uppercase tracking-widest text-accent-dim">
        Discount code
      </label>

      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void apply();
            }
          }}
          placeholder="WELCOME10"
          autoComplete="off"
          spellCheck={false}
          // `uppercase` is VISUAL only: the value stays exactly as typed, because the
          // server normalises and echoes back what it understood. Uppercasing the
          // value in the browser would make the field fight the person holding it.
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-fg placeholder:normal-case placeholder:tracking-normal placeholder:text-fg-muted focus:border-accent focus:outline-none"
          aria-describedby={`${inputId}-help`}
          aria-invalid={shown.tone === "bad"}
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || code.trim() === ""}
          className="flex-shrink-0 rounded-lg border border-accent px-4 py-2.5 text-sm text-accent transition-colors hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>

      {/* `aria-live="polite"` so a screen reader hears the outcome without the focus
          moving — the customer typed, so the focus belongs on the input. */}
      <p
        id={`${inputId}-help`}
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-[1rem] text-xs ${
          shown.tone === "good" ? "text-accent" : shown.tone === "bad" ? "text-[#FF6B35]" : "text-fg-muted"
        }`}
      >
        {shown.text || (appliedLabel ? `${appliedLabel} is applied.` : "Codes are matched without case.")}
      </p>
    </div>
  );
}