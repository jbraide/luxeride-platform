"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useCartStore } from "@/store/cart";
import { useOrderStore } from "@/store/order";
import { LOCATIONS } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import { PREPAY_AVAILABLE } from "@/lib/payment-options";
import { useHasMounted } from "@/lib/use-has-mounted";
import { validateNGPhone } from "@/lib/validation";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/Button";

export default function CheckoutView() {
  const router = useRouter();
  const { items, subtotal, clear } = useCartStore();
  const setLastOrder = useOrderStore((s) => s.setLastOrder);
  const mounted = useHasMounted();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<string>("");
  const [payment, setPayment] = useState<"pod" | "prepay">("pod");
  const [phoneError, setPhoneError] = useState(false);
  const [zoneError, setZoneError] = useState(false);

  const zone = LOCATIONS.find((l) => l.name === location);
  const shippingFee = payment === "prepay" ? 0 : (zone?.fee ?? 0);
  const discount = payment === "prepay" ? 2000 : 0;
  const total = Math.max(subtotal() + shippingFee - discount, 0);

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
    if (!validateNGPhone(phone)) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    if (!zone) {
      setZoneError(true);
      return;
    }
    setZoneError(false);
    if (!name.trim() || !address.trim()) return;

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
      },
      false
    );

    const order = {
      id: `LR-${Date.now().toString(36).toUpperCase()}`,
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

    setLastOrder(order);
    window.open(whatsappLink(message), "_blank");
    clear();
    router.push("/order/confirmation");
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-2xl font-semibold">Almost done</h1>
      <p className="mt-1 text-sm text-muted">We&apos;ll send this straight to WhatsApp for dispatch verification</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Full name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chidinma Okafor"
            className="w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">WhatsApp number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0704 962 1694"
            className="w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          />
          {phoneError && (
            <p className="mt-1 text-xs text-[#FF6B35]">
              Enter a valid Nigerian number (070/080/081/090/091 or +234)
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Delivery address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Street, estate/landmark, nearest bus stop"
            className="w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          />
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

        <Button onClick={submit}>Confirm My Order on WhatsApp</Button>

        <div className="rounded-xl border border-line bg-panel/60 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">Pre-filled WhatsApp message</p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-white/90">{preview}</pre>
        </div>
      </div>
    </div>
  );
}
