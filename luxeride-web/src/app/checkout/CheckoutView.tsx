"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useCartStore } from "@/store/cart";
import { useOrderStore, type PlacedOrder } from "@/store/order";
import { LOCATIONS } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import { PREPAY_AVAILABLE } from "@/lib/payment-options";
import { useHasMounted } from "@/lib/use-has-mounted";
import { validateNGPhone } from "@/lib/validation";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import { createOrderRef } from "@/lib/orderRef";
import { track } from "@/lib/analytics";
import { readAttribution } from "@/lib/analytics/attribution";
import { Button } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import { contact, delivery } from "@/lib/copy";

export default function CheckoutView() {
  const router = useRouter();
  const { items, subtotal, count, clear } = useCartStore();
  const orders = useOrderStore((s) => s.orders);
  const setOrder = useOrderStore((s) => s.setOrder);
  const markLeadFired = useOrderStore((s) => s.markLeadFired);
  const mounted = useHasMounted();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<string>("");
  const [payment, setPayment] = useState<"pod" | "prepay">("pod");
  const [phoneError, setPhoneError] = useState(false);
  const [zoneError, setZoneError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const zone = LOCATIONS.find((l) => l.name === location);
  const shippingFee = payment === "prepay" ? 0 : (zone?.fee ?? 0);
  const discount = payment === "prepay" ? 2000 : 0;
  const total = Math.max(subtotal() + shippingFee - discount, 0);

  const itemCount = count();
  const cartSubtotal = subtotal();

  // `checkout_start` (`cart-checkout` §12.2, master-build-plan M3.15). Fired
  // after rehydration so the payload is the real cart, not the empty one.
  useEffect(() => {
    if (!mounted || items.length === 0) return;
    track("checkout_start", { itemCount, subtotal: cartSubtotal, zone: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const preview = useMemo(
    () =>
      buildOrderMessage(
        {
          name,
          phone,
          address,
          location: zone?.name ?? "[Delivery zone]",
          paymentMethod: payment,
          items,
          subtotal: subtotal(),
          shippingFee,
          discount,
          total,
        },
        true
      ),
    [name, phone, address, zone, payment, items, shippingFee, discount, total, subtotal]
  );

  // Defect D1: the cart store rehydrates synchronously on the client.
  if (!mounted) {
    return <StorageSkeleton title="Checkout" note="Loading your saved cart…" />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Nothing to check out yet</h1>
        <p className="mt-2 text-muted">Add something to your cart first.</p>
      </div>
    );
  }

  function submit() {
    // §5.1–5.2: every failure is named, announced and measured. The old
    // `if (!name.trim() || !address.trim()) return;` exited silently, which
    // reads as a dead button and tells the owner nothing. The server-side
    // rejection that actually matters is still M6's; this is the surface half.
    if (!name.trim()) {
      setNameError(true);
      track("checkout_validation_error", { field: "name", reason: "Name is required." });
      return;
    }
    setNameError(false);

    if (!validateNGPhone(phone)) {
      setPhoneError(true);
      track("checkout_validation_error", {
        field: "phone",
        reason: "Enter a valid Nigerian number.",
      });
      return;
    }
    setPhoneError(false);

    if (!address.trim()) {
      setAddressError(true);
      track("checkout_validation_error", { field: "address", reason: "Address is required." });
      return;
    }
    setAddressError(false);

    if (!zone) {
      setZoneError(true);
      track("checkout_validation_error", { field: "zone", reason: "No delivery zone chosen." });
      return;
    }
    setZoneError(false);

    // The consent control ships with the `/privacy` route or not at all
    // (`trust-and-policies` §9.6, `cart-checkout` 10.1). It blocks submission
    // and the `window.open` below while unchecked — the mechanic is this
    // spec's; the route it links to is `trust-and-policies`'.
    if (!consent) {
      setConsentError(true);
      track("checkout_validation_error", {
        field: "consent",
        reason: "Privacy consent not given.",
      });
      return;
    }
    setConsentError(false);

    // First-touch attribution, copied onto the order so it carries its own
    // campaign even if the record is later cleared (§5.6).
    const attribution = readAttribution();
    const campaign =
      attribution && attribution.campaign !== "(not set)" ? attribution.campaign : undefined;

    // Mint the reference against the retained history, build the message that
    // carries it, write the order and fire `Lead` — ALL before `window.open`,
    // and none of it awaited, because the popup must stay inside the user-gesture
    // call stack or the browser blocks it (§6.8, §8.7).
    const ref = createOrderRef(orders.map((o) => o.ref));
    const message = buildOrderMessage(
      {
        name,
        phone,
        address,
        location: zone.name,
        paymentMethod: payment,
        items,
        subtotal: subtotal(),
        shippingFee,
        discount,
        total,
        ref,
        fitRef: null,
        campaign,
      },
      false
    );

    const order: PlacedOrder = {
      ref,
      fitRef: null,
      attribution,
      name,
      phone,
      address,
      location: zone.name,
      paymentMethod: payment,
      items,
      subtotal: subtotal(),
      shippingFee,
      discount,
      total,
      whatsappMessage: message,
      placedAt: new Date().toISOString(),
    };

    setOrder(order);
    track("order_prepared", {
      ref,
      value: total,
      itemCount,
      campaign: campaign ?? "(not set)",
    });
    track("lead", { value: total, ref });
    markLeadFired(ref);

    // `handoff_attempted` before the popup and `handoff_confirmed` after it,
    // carrying `window.open`'s own return value — because the one thing that
    // cannot be reconstructed later is whether the browser blocked the window.
    // A `null` handle is not a reason to skip the event; it is the event's most
    // important payload, and it is what M6.7's recovery path hangs off.
    track("handoff_attempted", { ref });
    const opened = window.open(whatsappLink(message), "_blank");
    track("handoff_confirmed", { ref, popupOpened: opened !== null });

    clear();
    router.push(`/order/confirmation?ref=${encodeURIComponent(ref)}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-2xl font-semibold">Almost done</h1>
      <p className="mt-1 text-sm text-muted">We&apos;ll send this straight to WhatsApp for dispatch verification</p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="co-name" className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">
            Full name
          </label>
          <input
            id="co-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameError}
            aria-describedby={nameError ? "co-name-error" : undefined}
            placeholder="e.g. Chidinma Okafor"
            className={`w-full rounded-xl border bg-panel px-4 py-3.5 text-sm focus:outline-none ${nameError ? "border-[#FF6B35]" : "border-white/15 focus:border-gold"}`}
          />
          {nameError && (
            <p id="co-name-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              Enter the name the rider should ask for.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="co-phone" className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">
            WhatsApp number
          </label>
          <input
            id="co-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={phoneError}
            aria-describedby={phoneError ? "co-phone-error" : undefined}
            placeholder="e.g. 0704 962 1694"
            className={`w-full rounded-xl border bg-panel px-4 py-3.5 text-sm focus:outline-none ${phoneError ? "border-[#FF6B35]" : "border-white/15 focus:border-gold"}`}
          />
          {phoneError && (
            <p id="co-phone-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              Enter a valid Nigerian number (070/080/081/090/091 or +234)
            </p>
          )}
        </div>

        <div>
          <label htmlFor="co-address" className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">
            Delivery address
          </label>
          <textarea
            id="co-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-invalid={addressError}
            aria-describedby={addressError ? "co-address-error" : undefined}
            rows={2}
            placeholder="Street, estate/landmark, nearest bus stop"
            className={`w-full rounded-xl border bg-panel px-4 py-3.5 text-sm focus:outline-none ${addressError ? "border-[#FF6B35]" : "border-white/15 focus:border-gold"}`}
          />
          {addressError && (
            <p id="co-address-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              Enter the address the rider should deliver to.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Delivery zone</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          >
            {/* No default. Defaulting to LOCATIONS[0] quoted every non-Lagos
                customer 24–48 h against a real 5–7 days (cart-checkout §6). */}
            <option value="" disabled>
              Choose your delivery zone
            </option>
            {LOCATIONS.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} — {fmtNaira(l.fee)} · {l.eta}
              </option>
            ))}
          </select>
          {zone && <p className="mt-1 text-xs text-muted">Estimated arrival: {zone.eta} after confirmation.</p>}
          {zoneError && (
            <p role="alert" className="mt-1 text-xs text-[#FF6B35]">
              Choose the zone we deliver to, so the fee and the estimate are right.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Payment method</label>
          <div className="space-y-2">
            <button
              onClick={() => setPayment("pod")}
              className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm ${
                payment === "pod" ? "border-gold bg-panel-2 shadow-[0_0_0_1px_var(--gold)_inset]" : "border-white/15 bg-panel"
              }`}
            >
              <span className="font-semibold">Pay on Delivery</span>
              <span className="mt-0.5 block text-xs text-muted">
                The rider collects cash or a transfer when your order arrives — nothing to pay now.
              </span>
            </button>
            {PREPAY_AVAILABLE && (
              <button
                onClick={() => setPayment("prepay")}
                className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm ${
                  payment === "prepay" ? "border-gold bg-panel-2 shadow-[0_0_0_1px_var(--gold)_inset]" : "border-white/15 bg-panel"
                }`}
              >
                <span className="font-semibold">
                  Bank Transfer{" "}
                  <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-gold">
                    Save ₦2,000
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  We send the account details on WhatsApp, and the discount applies once your transfer is received.
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-dashed border-white/15 pt-4">
          <span className="text-sm text-muted">Total due</span>
          <span className="font-mono text-2xl font-bold text-gold">{zone ? fmtNaira(total) : "—"}</span>
        </div>
        {!zone && <p className="text-xs text-muted">Choose a delivery zone to see the total.</p>}

        {/* The trust block immediately above the submit button
            (`trust-and-policies` §9.4) — the guarantee, the fee band and the
            prepay saving in one component, so the four surfaces that quote them
            cannot disagree. */}
        <TrustStrip variant="summary" />

        {/* The consent control (§9.6). It gates submission and the handoff; the
            route it links to is `/privacy`, built by M4.4. */}
        <div>
          <label className="flex items-start gap-3 text-xs text-muted">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={consentError}
              aria-describedby={consentError ? "co-consent-error" : undefined}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--gold)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/privacy" className="text-gold hover:underline">
                privacy policy
              </Link>
              . My name, number and address are used to deliver this order and are never
              sent to Meta or Google.
            </span>
          </label>
          {consentError && (
            <p id="co-consent-error" role="alert" className="mt-1 text-xs text-[#FF6B35]">
              Please tick the box so we may use your details to deliver the order.
            </p>
          )}
        </div>

        <Button onClick={submit}>Confirm My Order on WhatsApp</Button>

        {/* A WhatsApp hand-off is the only route out today, so a blocked popup
            or an app-less phone would strand the order. `tel:` and the email
            fallback make it survivable (§9.5, §7.2). */}
        <p className="text-center text-xs text-muted">
          WhatsApp not working?{" "}
          <a href={contact.tel} className="text-gold hover:underline">
            Call {contact.whatsappNumber}
          </a>{" "}
          and read the message below to us.
        </p>

        <div className="rounded-xl border border-line bg-panel/60 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">Pre-filled WhatsApp message</p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-white/90">{preview}</pre>
        </div>

        <p className="text-center text-xs text-muted">
          We confirm every order on WhatsApp before dispatch. Delivery is {delivery.range()} depending
          on your zone — nothing is charged now.
        </p>
      </div>
    </div>
  );
}
