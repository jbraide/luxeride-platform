"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useCartStore, type CartItem } from "@/store/cart";
import {
  useOrderStore,
  EMPTY_DRAFT,
  type CheckoutDraft,
} from "@/store/order";
import { fmtNaira } from "@/lib/pricing";
import type { DeliveryZone } from "@/lib/delivery";
import { PREPAY_DISCOUNT } from "@/lib/order-pricing";
import { PREPAY_AVAILABLE } from "@/lib/payment-options";
import CouponBox, { type DiscountPreview } from "@/components/CouponBox";
import { useHasMounted } from "@/lib/use-has-mounted";
import {
  validateOrderSubmission,
  type OrderFieldErrors,
  type OrderFieldPath,
} from "@/lib/order-validation";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import { createOrderRef } from "@/lib/orderRef";
import type {
  OrderAcceptedResponse,
  OrderLineResponse,
  OrderRejectedResponse,
} from "@/lib/order-wire";
import { track } from "@/lib/analytics";
import { readAttribution } from "@/lib/analytics/attribution";
import { Button } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import { contact, delivery } from "@/lib/copy";
import { optionLabel } from "@/lib/select-variation";

/**
 * The checkout form and the whole handoff sequence (`cart-checkout` §5.1–5.9 and
 * §6.1–6.13, at `master-build-plan` M6.7/M6.9).
 *
 * THE SEQUENCE, AND WHY IT HAS THREE STEPS
 *
 *   1. `POST /api/orders` with identity-only lines. The server prices it.
 *   2. Show what the SERVER priced, and open the message it built.
 *   3. Only when the customer taps "I've sent it", clear the cart and navigate.
 *
 * Before this the sequence was `window.open(); clear(); router.push()`. The
 * `clear()` ran whether or not the popup opened and no server ever saw the order,
 * so a blocked popup lost the sale outright. `cart-checkout` requirement 4.1–4.3
 * is the fix, and it costs one extra tap.
 *
 * `clear()` APPEARS EXACTLY ONCE IN THIS FILE, INSIDE `confirmSent()`. Not on
 * submit, not on a 422, not on a blocked popup, not on a network failure. A
 * WhatsApp window that never opened leaves the customer exactly where they were,
 * with their typed details and their cart, one tap from trying again.
 */

/** How long the "Copied" state stays up. From the prototype, not invented here. */
const COPY_FEEDBACK_MS = 1800;

/**
 * The control ids, in the order §5.3 says focus should walk them.
 *
 * Requirement 5.3: focus moves to the FIRST invalid control. A dotted
 * `lines.N.field` error has no control on this page — the cart owns those lines —
 * so focus falls back to the first one that does rather than being lost.
 */
const FIELD_CONTROL: Partial<Record<OrderFieldPath, string>> = {
  name: "co-name",
  phone: "co-phone",
  address: "co-address",
  location: "co-location",
  paymentMethod: "co-payment",
  consent: "co-consent",
};

/** Where the form is: filling in, waiting on the server, or holding a priced order. */
type Phase =
  | { step: "form" }
  | { step: "submitting" }
  | {
      step: "prepared";
      response: OrderAcceptedResponse;
      /** `window.open`'s OWN return value. `null` means the browser blocked it. */
      popupOpened: boolean;
    };

/**
 * One `crypto.randomUUID()` for the `idempotencyKey` (`commerce-backend` §6.5).
 *
 * A UUID and not an order reference: the two are different namespaces and the
 * column is a dedup token, not a customer-facing handle. The weaker fallback
 * mirrors `newEventId()` in `src/lib/analytics/index.ts`, so this file and the
 * analytics queue mint ids one way rather than two.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The persisted draft, read once per field at initialisation.
 *
 * §6.3 restores the draft into the fields, and it is read HERE, in a `useState`
 * initialiser, rather than by an effect that calls `setState`. Every keystroke
 * writes the draft, so an effect keyed on it would overwrite whatever the customer
 * is typing the instant they type it — and a setState-in-effect on mount is the
 * cascading-render shape React now warns about.
 *
 * `zustand/persist` rehydrates synchronously in the browser, so on the first
 * CLIENT render this already holds the restored draft. On the server it holds
 * `EMPTY_DRAFT`, and that value is never rendered, because the defect-D1
 * `useHasMounted()` guard shows the storage skeleton until after hydration. So
 * there is no hydration mismatch to design around — which is the whole reason
 * that skeleton exists.
 */
function restoredDraft(): CheckoutDraft {
  const draft = useOrderStore.getState().draft;
  return draft.updatedAt === "" ? EMPTY_DRAFT : draft;
}

/**
 * The delivery zones come from the SERVER (the `Location` table).
 *
 * They used to be the `LOCATIONS` constant, which `/api/orders` did not charge
 * from — so the fee shown here and the fee owed came from two different places
 * and could disagree. The page reads the table and hands it down.
 */
export default function CheckoutView({ zones }: { zones: DeliveryZone[] }) {
  const router = useRouter();
  const { items, subtotal, count, clear } = useCartStore();
  const setOrder = useOrderStore((s) => s.setOrder);
  const markLeadFired = useOrderStore((s) => s.markLeadFired);
  const setDraft = useOrderStore((s) => s.setDraft);
  const clearDraft = useOrderStore((s) => s.clearDraft);
  const mounted = useHasMounted();

  const [name, setName] = useState(restoredDraft().name);
  const [phone, setPhone] = useState(restoredDraft().phone);
  const [address, setAddress] = useState(restoredDraft().address);
  const [location, setLocation] = useState(restoredDraft().location);
  const [payment, setPayment] = useState<"pod" | "prepay">(restoredDraft().paymentMethod);
  /**
   * The coupon the SERVER accepted, or null.
   *
   * Set only from `/api/discount` saying `couponAccepted: true`. It is never set from
   * what the customer typed, because typing is not qualifying — a code with a minimum
   * spend has to be checked against the basket before it means anything. It is
   * re-resolved by `POST /api/orders` regardless, so a code that expired between
   * checking and submitting is simply not applied, rather than trusted.
   */
  const [coupon, setCoupon] = useState<string | null>(null);

  /**
   * WHAT THE SERVER PRICED THE GOODS AT — a promotion, a coupon, or nothing.
   *
   * A promotion and a coupon are ONE figure, not two, because `resolveDiscount` picks
   * the better of them and never both: the owner's no-stacking decision. So there is one
   * number here and it is whatever the server said is best.
   *
   * It is state rather than something derived from the cart on purpose. The basket alone
   * does not determine a discount — the date does, the rules in the database do, and
   * whether a code was typed does — so deriving it would mean reimplementing
   * `resolveDiscount` in the browser, which is the one thing the money path must not
   * have a second implementation of.
   */
  const [discount, setDiscount] = useState<DiscountPreview>({ amountOff: 0, label: null });
  // Deliberately NOT restored from the draft: ticking a privacy box is a
  // decision, and re-ticking one on the customer's behalf is not consent this
  // session asked for.
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<OrderFieldErrors>({});
  const [phase, setPhase] = useState<Phase>({ step: "form" });
  const [copied, setCopied] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  /**
   * The manual fallback, set ONLY when the endpoint could not be reached: the
   * message to send by hand, and the browser-minted reference inside it.
   *
   * State rather than a ref, because the render has to show that reference to the
   * customer. Built at the moment of failure rather than during render — it reads
   * first-party attribution out of `localStorage`, and a render must not.
   */
  const [offline, setOffline] = useState<{ message: string; reference: string } | null>(null);

  /**
   * The idempotency key for THIS checkout attempt (`commerce-backend` §6.5).
   *
   * Minted once per attempt and reused on every retry — which is the whole
   * mechanism. The server refuses a repeat of a key it has already stored and
   * re-reads that order instead of creating a second one.
   *
   * Minted LAZILY on the first submit rather than during render: a render must be
   * pure, and a key minted during one would be a DIFFERENT key on every re-render,
   * which is precisely the double-submit the unique index exists to stop. Reset
   * only after a CONFIRMED handoff, so a failed attempt retried ten times is
   * still one order.
   */
  const idempotencyKey = useRef<string | null>(null);

  /**
   * Mint ONE browser reference for the offline fallback, and reuse it for every
   * retry of this attempt so the customer's messages all carry the same handle.
   *
   * The LAST place a browser mints an order reference, and it exists only because
   * there is no server response to take one from. The copy beside it says so:
   * "This reference was made in your browser and is not stored on our side."
   */
  const offlineRef = useRef<string | null>(null);

  const zone = zones.find((l) => l.name === location);

  // The client-side total. Provisional by design: requirement 3.4 makes the
  // SERVER's figure the one shown, so this exists only to let the number react
  // to a zone or a payment method before anything is sent.
  const shownShippingFee = payment === "prepay" ? 0 : (zone?.fee ?? 0);

  /**
   * THE TOTAL, AND THE DEFECT THAT WAS IN IT.
   *
   * This used to be:
   *
   *     const shownDiscount = payment === "prepay" ? PREPAY_DISCOUNT : 0;
   *
   * which knew about the prepay saving and NOTHING else. So a customer could type a
   * valid code, be told "SAVE15 applied — ₦10,200 off" in the box, and watch the total
   * beside it not move. The coupon was not broken: `priceOrder()` added the resolved
   * promotion to the prepay discount and the order was charged less. The page was
   * quoting a different number from the one it was about to be charged, which is worse
   * than a coupon that does not work — it is a quote that lies.
   *
   * A live sitewide promotion was invisible here for the same reason, so the Christmas
   * sale ran for weeks and the checkout total never mentioned it.
   *
   * WHAT IS IN IT NOW, AND WHY IT IS ADDED TO THE PREPAY FIGURE
   *
   * `priceOrder()` splits the discount into `promotional` (a sale OR a coupon, never
   * both — `resolveDiscount` picks the better one) and `prepayDiscount` (₦2,000 for
   * paying early), then sums them. These two are on different axes — one is a price
   * reduction, the other a reward for a payment method — so they legitimately combine,
   * and this mirrors that arithmetic exactly rather than inventing a rule of its own.
   *
   * The promotional figure is the SERVER's, from `/api/discount`. Never computed here:
   * a discount the browser can change in devtools is not a discount, and `/api/orders`
   * recomputes it anyway when the order is written.
   */
  const shownPromotional = discount.amountOff;
  const shownPrepay = payment === "prepay" ? Math.min(PREPAY_DISCOUNT, subtotal() + shownShippingFee) : 0;
  const shownDiscount = shownPromotional + shownPrepay;
  const shownTotal = zone ? Math.max(subtotal() + shownShippingFee - shownDiscount, 0) : null;

  const itemCount = count();
  const cartSubtotal = subtotal();

  /**
   * THE BASKET, AS A STABLE STRING, so the effect below depends on WHAT IS IN THE CART
   * rather than on the identity of an array rebuilt every render.
   */
  const discountLines = useMemo(
    () =>
      items.map((item) => ({
        // No category: `/api/discount` resolves it from the product slug, so a client
        // cannot steer a category-scoped promotion somewhere it was not written for, and
        // a cart saved before that field existed still works.
        productSlug: item.productSlug,
        categorySlug: "",
        amount: item.unitPrice * item.qty,
      })),
    [items],
  );
  const discountCartKey = JSON.stringify(discountLines);

  /**
   * RE-PRICE THE BASKET, SO WHAT IS SHOWN IS WHAT WILL BE CHARGED.
   *
   * The coupon box reports the figure when a code is applied, but a sitewide sale needs
   * no customer to type anything — and before this it was applied at the order and never
   * shown on the checkout page at all.
   *
   * IT SENDS THE CODE, AND THAT IS THE POINT.
   *
   * An earlier version of this effect fetched WITHOUT the coupon, to avoid asking the
   * same question twice when someone presses Apply. That left a real disagreement on
   * screen: change the basket after applying a code and the total silently dropped the
   * coupon while the box still read "SAVE15 is applied". One small extra request on
   * Apply is a fair price for the page never claiming a discount it is not charging.
   *
   * WHICH IS ALSO WHY A CODE THAT STOPPS QUALIFYING IS CLEARED
   *
   * A ₦20,000-off code with an ₦80,000 minimum is legitimate on one basket and not on
   * the next. The server is the only thing that can say so, so when it refuses a code
   * this page was holding, the code is dropped — otherwise the box would keep
   * announcing a discount the order will not get. The promotion still applies and is
   * still shown, because that is what the server priced.
   *
   * `cancelled` guards the one case a naive version gets wrong: the customer edits the
   * cart again before the first answer lands, and a slow early response overwrites a
   * fast later one with a figure for a basket that no longer exists.
   */
  useEffect(() => {
    if (!mounted || discountLines.length === 0) return;
    let cancelled = false;
    void fetch("/api/discount", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: discountLines, couponCode: coupon }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (body: { amountOff?: number; label?: string | null; couponAccepted?: boolean } | null) => {
          if (cancelled || !body) return;
          setDiscount({
            amountOff: typeof body.amountOff === "number" ? body.amountOff : 0,
            label: typeof body.label === "string" ? body.label : null,
          });
          if (coupon && body.couponAccepted === false) setCoupon(null);
        },
      )
      .catch(() => {
        // Nothing is said and nothing is shown. A failed preview leaves the previous
        // figure in place, and `/api/orders` recomputes it from scratch anyway — so the
        // worst case is a stale number on screen, never a wrong charge.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, discountCartKey, coupon]);

  // `checkout_start` (`cart-checkout` §12.2). Fired after rehydration so the
  // payload is the real cart, not the empty one.
  useEffect(() => {
    if (!mounted || items.length === 0) return;
    track("checkout_start", { itemCount, subtotal: cartSubtotal, zone: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // §6.1: every field change is written to the draft, and the draft is READ back
  // into the fields by `restoredDraft()` at initialisation rather than by an
  // effect. zustand's `persist` already wraps `localStorage` in a try/catch, so a
  // throw here cannot take the form down with it (requirement 12.3). This effect
  // only ever writes OUTWARD, to the store, which is the direction effects are
  // for.
  useEffect(() => {
    if (!mounted) return;
    setDraft({
      name,
      phone,
      address,
      location,
      paymentMethod: payment,
      updatedAt: new Date().toISOString(),
    });
  }, [mounted, name, phone, address, location, payment, setDraft]);

  const preview = useMemo(
    () =>
      buildOrderMessage(
        {
          name,
          phone,
          address,
          location: zone?.name ?? "[Delivery zone]",
          locationEta: zone?.eta,
          paymentMethod: payment,
          items,
          subtotal: cartSubtotal,
          shippingFee: shownShippingFee,
          discount: shownDiscount,
          total: shownTotal ?? 0,
        },
        true,
      ),
    [
      name,
      phone,
      address,
      zone,
      payment,
      items,
      shownShippingFee,
      shownDiscount,
      shownTotal,
      cartSubtotal,
    ],
  );

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** §6.6 / requirement 5.4: editing a field clears that field's error. */
  function clearFieldError(key: OrderFieldPath) {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** §6.6 / requirement 5.3: move focus to the first invalid control. */
  function focusFirstInvalid(path: OrderFieldPath | undefined) {
    if (!path) return;
    const id = FIELD_CONTROL[path] ?? FIELD_CONTROL.name;
    const element = id ? document.getElementById(id) : null;
    element?.focus();
  }

  // Defect D1: the cart store rehydrates synchronously on the client.
  if (!mounted) {
    return <StorageSkeleton title="Checkout" note="Loading your saved cart…" />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Nothing to check out yet</h1>
        <p className="mt-2 text-fg-muted">Add something to your cart first.</p>
        {/* §6.13 / requirement 9.5: the fit finder, not a dead end. */}
        <div className="mt-6 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row">
          <Button onClick={() => router.push("/fit-finder")}>Find your car&apos;s mats</Button>
          <Link href="/shop" className="text-sm text-accent hover:underline">
            or browse the shop
          </Link>
        </div>
      </div>
    );
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /**
   * Validate, render every error, focus the first invalid control, and send
   * nothing.
   *
   * §6.4 / requirements 5.1–5.5: while any field is invalid, nothing is sent,
   * nothing is created and the cart is untouched. The errors come from
   * `validateOrderSubmission` — the same module the server runs — so the form
   * cannot disagree with `/api/orders` about what is acceptable.
   */
  function validateClientSide(): boolean {
    if (!consent) {
      const message =
        "Please tick the box so we may use your details to deliver the order.";
      setErrors({ consent: message });
      track("checkout_validation_error", { field: "consent", reason: "Privacy consent not given." });
      focusFirstInvalid("consent");
      return false;
    }

    const result = validateOrderSubmission(
      {
        name,
        phone,
        address,
        location,
        paymentMethod: payment,
        // Identity only. The cart line carries a `unitPrice` and it is deliberately
        // not sent: §3.1 says the payload carries identity, and there is no field
        // here for a price to land in.
        lines: items.map(identityOf),
        couponCode: coupon,
      },
      // The LIVE zones, so the pre-check that runs before the request cannot reject a
      // zone the owner has just added (or accept one that was removed).
      zones,
    );

    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0] as OrderFieldPath | undefined;
      track("checkout_validation_error", {
        field: first === "location" || first === undefined ? "zone" : (first as "name" | "phone" | "address"),
        reason: "A field failed validation.",
      });
      focusFirstInvalid(first);
      return false;
    }

    setErrors({});
    return true;
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.step !== "form") return;
    if (!validateClientSide()) return;

    setPhase({ step: "submitting" });

    // Minted here and kept for the life of the attempt, so every retry carries
    // the SAME key and the server answers the second one with the first order.
    if (idempotencyKey.current === null) idempotencyKey.current = newIdempotencyKey();

    const attribution = readAttribution();
    const campaign =
      attribution && attribution.campaign !== "(not set)" ? attribution.campaign : undefined;

    let response: OrderAcceptedResponse | null = null;

    // The moment of commitment, fired BEFORE the request. It is the only way to
    // tell a form someone abandoned from one that reached the server and failed —
    // without it the drop between `checkout_start` and `lead` is unattributable.
    track("checkout_submit", { itemCount, subtotal: cartSubtotal, zone: zone?.name ?? null });

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          address,
          location,
          paymentMethod: payment,
          idempotencyKey: idempotencyKey.current,
          lines: items.map(identityOf),
          attribution,
        }),
      });

      const payload: unknown = await res.json();
      if (isAccepted(payload)) {
        response = payload;
      } else {
        // A 422 names the offending control; a 503 (`catalogue_unavailable`)
        // names none, because no field the customer typed is wrong. Both keep
        // the cart: requirement 12.4.
        const rejected = isRejected(payload) ? payload : null;
        const serverSide = rejected?.reason === "catalogue_unavailable";
        setErrors(
          serverSide
            ? {
                request:
                  rejected?.fieldErrors.request ??
                  "We could not price your order just now. Your cart is safe — try again in a moment.",
              }
            : (rejected?.fieldErrors ?? { request: "We could not take that order. Try again in a moment." }),
        );
        track("order_failed", {
          reason: "rejected",
          status: res.status,
          code: rejected?.reason ?? null,
        });
        setPhase({ step: "form" });
        return;
      }
    } catch {
      track("order_failed", { reason: "unreachable", status: 0, code: null });
      // Requirement 12.4: an unreachable endpoint keeps the cart, keeps the
      // draft, and offers a retry AND a manual WhatsApp fallback built from the
      // customer's own details. The reference in that message is the browser-
      // minted one, because no server priced this order — which is the only
      // thing left for `src/lib/orderRef.ts` to do.
      if (offlineRef.current === null) offlineRef.current = createOrderRef();
      const fallbackRef = offlineRef.current;

      setOffline({
        reference: fallbackRef,
        message: buildOrderMessage(
          {
            name,
            phone,
            address,
            location: zone?.name ?? "",
            locationEta: zone?.eta,
            paymentMethod: payment,
            items,
            subtotal: cartSubtotal,
            shippingFee: shownShippingFee,
            discount: shownDiscount,
            total: Math.max(cartSubtotal + shownShippingFee - shownDiscount, 0),
            ref: fallbackRef,
            fitRef: null,
            campaign,
          },
          false,
        ),
      });
      setErrors({
        request:
          "We could not reach the server. Your cart is safe — try again, or send the message below.",
      });
      setPhase({ step: "form" });
      return;
    }

    track("order_prepared", {
      ref: response.reference,
      value: response.total,
      itemCount,
      campaign: campaign ?? "(not set)",
    });
    track("lead", { value: response.total, ref: response.reference });
    markLeadFired(response.reference);

    // §6.8: `handoff_attempted` before the popup and `handoff_confirmed` after
    // it, carrying `window.open`'s OWN return value — because whether the browser
    // blocked the window is the one thing that cannot be reconstructed later. A
    // `null` handle is not a reason to skip the event; it is the event's most
    // important payload and it is what the prepared state is built on.
    track("handoff_attempted", { ref: response.reference });
    let opened: Window | null = null;
    try {
      opened = window.open(whatsappLink(response.whatsappMessage), "_blank");
    } catch {
      opened = null;
    }
    track("handoff_confirmed", { ref: response.reference, popupOpened: opened !== null });

    setPhase({ step: "prepared", response, popupOpened: opened !== null });
  }

  // ─── The prepared state: the only place the cart is cleared ──────────────────

  /**
   * "I've sent it" — the single tap that ends the sequence.
   *
   * §5.4 / requirement 4.3: the only call to `clear()`. The record is written
   * with the SERVER's priced lines, the draft is dropped, and the reference goes
   * into the URL so `/order/<reference>` can serve this order on a device that
   * has never seen this cart.
   */
  function confirmSent() {
    if (phase.step !== "prepared") return;
    const { response } = phase;

    setOrder({
      ref: response.reference,
      fitRef: null,
      attribution: readAttribution(),
      name,
      phone,
      address,
      location: response.location.name,
      locationEta: response.locationEta,
      paymentMethod: response.paymentMethod,
      items: response.lines.map(serverLineToCartItem),
      subtotal: response.subtotal,
      shippingFee: response.shippingFee,
      discount: response.discount,
      total: response.total,
      whatsappMessage: response.whatsappMessage,
      placedAt: response.placedAt,
      persisted: response.persisted,
    });

    clear();
    clearDraft();

    // §7.4: navigate to `/order/<reference>` rather than the `localStorage`
    // receipt, so the order is reachable from a hard refresh and another device.
    router.push(`/order/${encodeURIComponent(response.reference)}`);
  }

  async function copyText(value: string, set: (on: boolean) => void) {
    try {
      await navigator.clipboard?.writeText(value);
      set(true);
      window.setTimeout(() => set(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard blocked. Both the message and the reference are on screen in
      // full, so nothing is lost by not pretending the copy worked.
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  // ── Prepared: the priced order, the handoff, and the gate ──────────────────
  if (phase.step === "prepared") {
    const { response, popupOpened } = phase;
    const whatsappUrl = whatsappLink(response.whatsappMessage);
    const blocked = !popupOpened;

    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-display text-2xl font-semibold">
          Your order is priced and ready to send
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          These figures were priced on our server, not in your browser. Send the message on WhatsApp and we
          will pick it up from there.
        </p>

        {/* Requirement 3.4: when the server's total differs from the one the
            customer was shown, say so BEFORE the handoff is treated as done. A
            customer has to agree to the number that is real. */}
        {shownTotal !== null && shownTotal !== response.total && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#FF6B35] bg-surface px-4 py-3 text-sm"
          >
            The total has changed from {fmtNaira(shownTotal)} to{" "}
            <strong>{fmtNaira(response.total)}</strong> — we recalculate when you submit. The figure below
            is the one that applies.
          </p>
        )}

        {/* Requirement 1.2: a blocked popup says so, offers an explicit
            alternative, and shows no sent state. */}
        {blocked && (
          <p role="alert" className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            Your browser blocked the WhatsApp window. Tap <strong>Open WhatsApp</strong> below, or copy the
            message and send it yourself. Your cart is still here either way.
          </p>
        )}

        {/* §9.4: the write failed. The order is in WhatsApp and nowhere else,
            and the reference will not open a receipt page — so say that rather
            than let the customer discover it later. */}
        {!response.persisted && (
          <p role="alert" className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            We could not save a copy of this order on our side just now, so the reference below will not open
            a receipt page. The WhatsApp message is the record — please send it so we can confirm.
          </p>
        )}

        <div className="mt-5 space-y-2 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wide text-fg-muted">Reference</span>
            <button
              type="button"
              onClick={() => void copyText(response.reference, setRefCopied)}
              className="rounded-lg border border-border px-3 py-1.5 font-mono text-sm text-accent hover:border-accent"
            >
              {response.reference}
              <span className="ml-2 text-xs text-fg-muted">{refCopied ? "copied" : "tap to copy"}</span>
            </button>
          </div>
          {response.lines.map((line) => (
            <div key={line.key} className="flex justify-between text-sm">
              <span>
                {line.qty}x {line.productName}
                {/* The layer on the receipt. A Floor Mats order that does not say which
                    layer is a receipt for half a description, and the price beside it
                    is one of two. */}
                {optionLabel(line.variationSlug) ? ` (${optionLabel(line.variationSlug)})` : ""}
                {/* The car, or nothing: a shop-only line has none, and printing the empty
                    fields would leave a dangling " — ". */}
                {line.brand ? ` — ${line.year} ${line.brand} ${line.model}` : ""}
                {line.rows ? ` (${line.rows}-Row)` : ""}
              </span>
              <span className="font-mono text-accent">{fmtNaira(line.lineTotal)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-dashed border-fg-muted/25 pt-2 text-sm">
            <span className="text-fg-muted">
              Delivery ({response.location.name})
              {response.locationEta ? ` — ${response.locationEta}` : ""}
            </span>
            <span className="font-mono">
              {response.shippingFee ? fmtNaira(response.shippingFee) : "Free"}
            </span>
          </div>
          {response.discount > 0 && (
            <div className="flex justify-between text-sm text-accent">
              <span>Prepay discount</span>
              <span className="font-mono">-{fmtNaira(response.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-dashed border-fg-muted/25 pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono text-accent">{fmtNaira(response.total)}</span>
          </div>
        </div>

        {/* Requirement 1.3: the site cannot observe WhatsApp. Say so, and never
            claim the message was sent. */}
        <p className="mt-5 text-sm text-fg-muted">
          We cannot see your WhatsApp from here. Once you have sent it, tap the button below and we will
          take it from there.
        </p>

        <div className="mt-4 space-y-3">
          <Button onClick={confirmSent}>I&apos;ve sent it</Button>

          {/* A real anchor, so a tap navigates without a popup. §5.3: this is
              the explicit alternative when `window.open` returned null. */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("whatsapp_cta_clicked", {
                ctaType: "checkout_order",
                location: "prepared_resend",
              })
            }
            className="block w-full rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent hover:text-accent"
          >
            {blocked ? "Open WhatsApp" : "Resend the message"}
          </a>

          <Button variant="ghost" onClick={() => void copyText(response.whatsappMessage, setCopied)}>
            {copied ? "Copied" : "Copy message"}
          </Button>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-surface/60 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-fg-muted">The message to send</p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-fg/90">
            {response.whatsappMessage}
          </pre>
        </div>
      </div>
    );
  }

  const submitting = phase.step === "submitting";
  const fieldError = (key: OrderFieldPath) => errors[key];

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-2xl font-semibold">Almost done</h1>
      <p className="mt-1 text-sm text-fg-muted">
        We&apos;ll send this straight to WhatsApp for dispatch verification
      </p>

      {/* A whole-submission failure — the network, a 503, an unreadable
          response. It is attached to no field because no field is at fault, and
          it carries the retry and the manual fallback. */}
      {errors.request && (
        <div role="alert" className="mt-4 rounded-xl border border-[#FF6B35] bg-surface px-4 py-3 text-sm">
          <p>{errors.request}</p>
          {offline && (
            <>
              <p className="mt-2">
                This reference was made in your browser and is not stored on our side:{" "}
                <span className="font-mono text-accent">{offline.reference}</span>
              </p>
              <a
                href={whatsappLink(offline.message)}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  track("whatsapp_cta_clicked", {
                    ctaType: "checkout_order",
                    location: "checkout_offline_fallback",
                  })
                }
                className="mt-2 block w-full rounded-xl border border-fg-muted/40 px-4 py-2.5 text-center text-xs font-semibold hover:border-accent hover:text-accent"
              >
                Open WhatsApp with the message
              </a>
            </>
          )}
        </div>
      )}

      {/* A real `<form>` with NAMED inputs (§6.4). Native `required`, `type` and
          `maxLength` all participate — there is deliberately NO `noValidate`, so
          the browser refuses an empty required field itself and this handler only
          runs for what the browser considers well-formed but the domain rules do
          not (a phone of "12345", a quantity of 500). */}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="co-name" className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted">
            Full name
          </label>
          <input
            id="co-name"
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError("name");
            }}
            aria-invalid={Boolean(fieldError("name"))}
            aria-describedby={fieldError("name") ? "co-name-error" : undefined}
            placeholder="e.g. Chidinma Okafor"
            className={`w-full rounded-xl border bg-surface px-4 py-3.5 text-sm focus:outline-none ${fieldError("name") ? "border-[#FF6B35]" : "border-fg-muted/25 focus:border-accent"}`}
          />
          {fieldError("name") && (
            <p id="co-name-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("name")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="co-phone" className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted">
            WhatsApp number
          </label>
          <input
            id="co-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            maxLength={32}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearFieldError("phone");
            }}
            aria-invalid={Boolean(fieldError("phone"))}
            aria-describedby={fieldError("phone") ? "co-phone-error" : undefined}
            placeholder="e.g. 0704 962 1694"
            className={`w-full rounded-xl border bg-surface px-4 py-3.5 text-sm focus:outline-none ${fieldError("phone") ? "border-[#FF6B35]" : "border-fg-muted/25 focus:border-accent"}`}
          />
          {fieldError("phone") && (
            <p id="co-phone-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("phone")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="co-address" className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted">
            Delivery address
          </label>
          <textarea
            id="co-address"
            name="address"
            required
            maxLength={280}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              clearFieldError("address");
            }}
            aria-invalid={Boolean(fieldError("address"))}
            aria-describedby={fieldError("address") ? "co-address-error" : undefined}
            rows={2}
            placeholder="Street, estate/landmark, nearest bus stop"
            className={`w-full rounded-xl border bg-surface px-4 py-3.5 text-sm focus:outline-none ${fieldError("address") ? "border-[#FF6B35]" : "border-fg-muted/25 focus:border-accent"}`}
          />
          {fieldError("address") && (
            <p id="co-address-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("address")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="co-location" className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted">
            Delivery zone
          </label>
          <select
            id="co-location"
            name="location"
            required
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              clearFieldError("location");
            }}
            aria-invalid={Boolean(fieldError("location"))}
            aria-describedby={fieldError("location") ? "co-location-error" : undefined}
            className="w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm focus:border-accent focus:outline-none"
          >
            {/* No default. Defaulting to the first zone quoted every non-Lagos
                customer 24–48 h against a real 5–7 days (§6.7). */}
            <option value="" disabled>
              Choose your delivery zone
            </option>
            {zones.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name} — {fmtNaira(l.fee)} · {l.eta}
              </option>
            ))}
          </select>
          {/* §6.8: the ETA beside the control, not only inside the <option> text
              where it vanishes the moment one is chosen. */}
          {zone && (
            <p className="mt-1 text-xs text-fg-muted">Estimated arrival: {zone.eta} after confirmation.</p>
          )}
          {fieldError("location") && (
            <p id="co-location-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("location")}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-[11px] uppercase tracking-wide text-fg-muted">
            Payment method
          </legend>
          <div className="space-y-2">
            <button
              type="button"
              id="co-payment"
              onClick={() => setPayment("pod")}
              aria-pressed={payment === "pod"}
              className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm ${
                payment === "pod"
                  ? "border-accent bg-surface-2 shadow-[0_0_0_1px_var(--gold)_inset]"
                  : "border-fg-muted/25 bg-surface"
              }`}
            >
              <span className="font-semibold">Pay on Delivery</span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                The rider collects cash or a transfer when your order arrives — nothing to pay now.
              </span>
            </button>
            {PREPAY_AVAILABLE && (
              <button
                type="button"
                onClick={() => setPayment("prepay")}
                aria-pressed={payment === "prepay"}
                className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm ${
                  payment === "prepay"
                    ? "border-accent bg-surface-2 shadow-[0_0_0_1px_var(--gold)_inset]"
                    : "border-fg-muted/25 bg-surface"
                }`}
              >
                <span className="font-semibold">
                  Bank Transfer{" "}
                  {/* §6.9: the customer's REAL saving from the selected zone,
                      not a static badge — and never more than the order is worth
                      (requirement 8.7). */}
                  {zone && cartSubtotal > 0 && (
                    <span className="ml-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-accent">
                      Save {fmtNaira(Math.min(zone.fee + PREPAY_DISCOUNT, cartSubtotal + zone.fee))}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  We send the account details on WhatsApp, and the discount applies once your transfer is
                  received.
                </span>
              </button>
            )}
          </div>
          {fieldError("paymentMethod") && (
            <p role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("paymentMethod")}
            </p>
          )}
        </fieldset>

        {items.length > 0 && (
          <div className="mt-4">
            <CouponBox
              lines={discountLines}
              onApplied={setCoupon}
              /* The box knows what the server charged; the total has to be told, or the
                 page quotes a figure the order is not going to use. */
              onPriced={setDiscount}
              appliedLabel={coupon}
            />
          </div>
        )}

        {/* ── The discount, before the total ───────────────────────────────────
            *
            * The ORDER of these lines is the whole point. A customer sees their items,
            * then a named discount, then a total that is arithmetically the two
            * subtracted — and if the total changes, `shownTotal !== response.total`
            * below explains that the server's figures won. Showing the total first and
            * the saving after would make the saving look like something extra rather
            * than something already taken off.
            */}
        {shownDiscount > 0 && (
          <div className="flex items-baseline justify-between border-t border-dashed border-fg-muted/25 pt-3">
            <span className="text-sm text-fg-muted">
              {/*
                NAMED, because an unlabelled saving is the half of this bug. When the box
                says "SAVE15 applied" and the line under it says "Discount", nobody has
                been shown which discount moved the total — and with a promotion AND a
                coupon AND a prepay reward in play there can be up to two of them.
              */}
              {discount.label ?? (shownPrepay > 0 ? "Prepay saving" : "Discount")}
              {shownPrepay > 0 && shownPromotional > 0 && (
                <span className="ml-1 text-fg-muted">+ prepay saving</span>
              )}
            </span>
            <span className="tabular font-mono text-sm text-accent">
              −{fmtNaira(shownDiscount)}
            </span>
          </div>
        )}

        <div className="flex items-baseline justify-between border-t border-dashed border-fg-muted/25 pt-4">
          <span className="text-sm text-fg-muted">Total due</span>
          <span className="tabular font-mono text-2xl font-bold text-accent">
            {shownTotal !== null ? fmtNaira(shownTotal) : "—"}
          </span>
        </div>
        {!zone && <p className="text-xs text-fg-muted">Choose a delivery zone to see the total.</p>}

        {/* The trust block immediately above the submit button
            (`trust-and-policies` §9.4) — the guarantee, the fee band and the
            prepay saving in one component, so the four surfaces that quote them
            cannot disagree. */}
        <TrustStrip variant="summary" zones={zones} />

        {/* The consent control (§9.6). It gates submission and the handoff.
            `/privacy` WAS the href and it 404s: the policy ships at
            `/policies/privacy` (`src/app/policies/[slug]/page.tsx`, over the
            `privacy`/`terms`/`delivery`/`returns` slugs in `src/data/policies.ts`).
            Both were measured — `/policies/privacy` 200, `/privacy` 404 — and
            requirement 10.4 is explicit: "a consent checkbox pointing at a 404 is
            worse than no checkbox". So the link now names the route that exists.
            `TrustStrip.tsx` and `CartView.tsx` carry the same `/returns` and
            `/delivery` defect; those files belong to another agent this round and
            are reported rather than edited. */}
        <div>
          <label className="flex items-start gap-3 text-xs text-fg-muted">
            <input
              id="co-consent"
              name="consent"
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                clearFieldError("consent");
              }}
              aria-invalid={Boolean(fieldError("consent"))}
              aria-describedby={fieldError("consent") ? "co-consent-error" : undefined}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--gold)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/policies/privacy" className="text-accent hover:underline">
                privacy policy
              </Link>
              . My name, number and address are used to deliver this order and are never sent to Meta or
              Google.
            </span>
          </label>
          {fieldError("consent") && (
            <p id="co-consent-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              {fieldError("consent")}
            </p>
          )}
        </div>

        {/* §5.5 / requirement 4.5: disabled and relabelled while in flight. The
            REAL double-submit guard is `Order.idempotencyKey @unique`; this is
            the courtesy, and a double-click is two real sequential POSTs. */}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Pricing your order…" : "Confirm My Order on WhatsApp"}
        </Button>

        {/* A WhatsApp hand-off is the only route out today, so a blocked popup or
            an app-less phone would strand the order. `tel:` and the manual
            contact route make it survivable (§9.5, §7.2). */}
        <p className="text-center text-xs text-fg-muted">
          WhatsApp not working?{" "}
          <a href={contact.tel} className="text-accent hover:underline">
            Call {contact.whatsappNumber}
          </a>{" "}
          and read the message below to us.
        </p>

        <div className="rounded-xl border border-border bg-surface/60 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-fg-muted">Pre-filled WhatsApp message</p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-fg/90">{preview}</pre>
        </div>

        <p className="text-center text-xs text-fg-muted">
          We confirm every order on WhatsApp before dispatch. Delivery is {delivery.range(zones)} depending on
          your zone — nothing is charged now.
        </p>

        {/* §5.7: safe precisely because the draft is persisted (§6.1). */}
        <Link href="/fit-finder" className="block text-center text-sm text-fg-muted hover:text-fg">
          ← Back to your fit
        </Link>
      </form>
    </div>
  );
}

// ─── Payload and line helpers ──────────────────────────────────────────────────

/**
 * One cart line, reduced to identity. §3.1: the payload carries which product,
 * which car, which rows and how many, and no price of any kind.
 */
function identityOf(item: CartItem) {
  return {
    productSlug: item.productSlug,
    // WHICH LAYER. Sent because the server prices a named option from that option's
    // figures, and Floor Mats is one product in two layers at two prices. Omitting it
    // would order a double-layer set at the single-layer figure while the page above
    // shows the double-layer price — a receipt that disagrees with the screen it was
    // bought from.
    variationSlug: item.variationSlug ?? null,
    brand: item.brand,
    model: item.model,
    year: item.year,
    rows: item.rows,
    qty: item.qty,
  };
}

/**
 * A server-priced line as the `CartItem` the local record expects.
 *
 * `id` is `line.key`, which is `lineKey()` — the cart's own merge key — so a
 * re-ordered cart produces the line ids it started with and `addItem`'s merge
 * (§8.1) behaves exactly as it does for a fresh cart.
 */
function serverLineToCartItem(line: OrderLineResponse): CartItem {
  return {
    id: line.key,
    productSlug: line.productSlug,
    // Carried across so the local record still says which layer the customer chose.
    // `id` is `line.key`, which already encodes the option, so a cart rebuilt without
    // it would hold a line whose key names a layer its own fields do not.
    variationSlug: line.variationSlug ?? null,
    productName: line.productName,
    brand: line.brand,
    model: line.model,
    year: line.year,
    rows: line.rows,
    unitPrice: line.unitPrice,
    qty: line.qty,
  };
}

function isAccepted(payload: unknown): payload is OrderAcceptedResponse {
  return (
    payload !== null &&
    typeof payload === "object" &&
    (payload as { ok?: unknown }).ok === true &&
    typeof (payload as { reference?: unknown }).reference === "string"
  );
}

function isRejected(payload: unknown): payload is OrderRejectedResponse {
  return (
    payload !== null &&
    typeof payload === "object" &&
    (payload as { ok?: unknown }).ok === false &&
    typeof (payload as { fieldErrors?: unknown }).fieldErrors === "object"
  );
}