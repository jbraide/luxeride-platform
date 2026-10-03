"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useOrderStore, migrateLegacyOrder } from "@/store/order";
import { fmtNaira } from "@/lib/pricing";
import { useHasMounted } from "@/lib/use-has-mounted";
import { LinkButton } from "@/components/Button";
import { track } from "@/lib/analytics";
import { readAttribution } from "@/lib/analytics/attribution";
import { whatsappLink, recoveryMessage } from "@/lib/whatsapp";

/**
 * The thank-you screen (`ad-landing-and-tracking` §9).
 *
 * It looks the order up BY REFERENCE rather than reading a single `lastOrder`,
 * so a second order does not erase the first. Three states:
 *
 *   - the order is stored -> the summary, with `Lead` fired at most once per ref
 *   - a ref in the URL but no stored order -> a RECOVERY screen addressed to that
 *     ref, never "No recent order found"
 *   - neither -> three actions, and no implication that an order was lost
 */
export default function ConfirmationView() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const orders = useOrderStore((s) => s.orders);
  const markLeadFired = useOrderStore((s) => s.markLeadFired);
  const hasLeadFired = useOrderStore((s) => s.hasLeadFired);
  const mounted = useHasMounted();
  const [copied, setCopied] = useState(false);

  // One-time migration from the single-order store (§9.9). Safe in an effect;
  // `localStorage` does not exist during server rendering.
  useEffect(() => {
    migrateLegacyOrder();
  }, []);

  // Fall back to the most recent order when no ref is present, so a checkout
  // that reached the page without a ref still shows its receipt.
  const order = ref ? orders.find((o) => o.ref === ref) : orders[0];

  // `Lead` at most once per reference, so a refresh cannot inflate the owner's
  // conversion count against his ad spend (§7.7). Checkout already marks the ref
  // fired; this is the guard for the confirmation screen itself.
  useEffect(() => {
    if (!order) return;
    if (hasLeadFired(order.ref)) return;
    track("lead", { value: order.total, ref: order.ref });
    markLeadFired(order.ref);
  }, [order, hasLeadFired, markLeadFired]);

  if (!mounted) {
    return <StorageSkeleton title="Your Order" note="Loading your order…" />;
  }

  // Ref present but no stored order: the RECOVERY screen (§7.4).
  if (!order && ref) {
    const campaign = readAttribution()?.campaign;
    return (
      <div className="mx-auto max-w-xl px-5 py-14 text-center">
        <h1 className="font-display text-2xl font-semibold">Your order is safe on WhatsApp</h1>
        <p className="mt-2 text-sm text-muted">
          This browser no longer holds a copy of the order, but the message you sent us does. Quote the
          reference below and we will find it.
        </p>
        <p className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-lg text-gold">
          {ref}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={whatsappLink(recoveryMessage(ref, campaign))}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("whatsapp_cta_clicked", { ctaType: "checkout_order", location: "recovery" })
            }
            className="inline-flex w-full items-center justify-center rounded-xl bg-gold px-5 py-3.5 text-sm font-semibold text-ink sm:w-auto sm:px-8"
          >
            Look It Up on WhatsApp
          </a>
          <LinkButton href="/shop" variant="outline" className="sm:w-auto sm:px-8">
            Start a New Order
          </LinkButton>
        </div>
        <Link href="/" className="mt-6 inline-block text-sm text-muted hover:text-white">
          Back to Home
        </Link>
      </div>
    );
  }

  // Neither a ref nor any stored order: three actions, nothing lost (§7.5).
  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">No order to show here</h1>
        <p className="mt-2 text-muted">
          If you just ordered, your message is already with us on WhatsApp. Otherwise, start a new order,
          message us, or hand us a reference to look up.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href="/shop" className="sm:w-auto sm:px-8">
            Start a New Order
          </LinkButton>
          <a
            href={whatsappLink("Hi! Can you help me find my order?")}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("whatsapp_cta_clicked", { ctaType: "checkout_order", location: "confirmation_empty" })
            }
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/25 px-5 py-3.5 text-sm font-semibold hover:border-gold hover:text-gold sm:w-auto sm:px-8"
          >
            Ask on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  async function copyRef() {
    if (!order) return;
    try {
      await navigator.clipboard?.writeText(order.ref);
      setCopied(true);
      track("ref_code_copied", { ref: order.ref });
    } catch {
      // Clipboard blocked: the ref is visible regardless.
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold text-2xl text-gold">
        ✓
      </div>
      <h1 className="font-display text-2xl font-semibold">Order sent — check WhatsApp</h1>
      <p className="mt-2 text-sm text-muted">
        We&apos;ll confirm dispatch once you reply. Keep this reference:
      </p>
      <button
        type="button"
        onClick={copyRef}
        className="mt-3 rounded-xl border border-line bg-panel px-4 py-2.5 font-mono text-base text-gold hover:border-gold"
      >
        {order.ref}
        <span className="ml-2 text-xs text-muted">{copied ? "copied ✓" : "tap to copy"}</span>
      </button>
      <p className="mt-2 text-xs text-muted">
        This page is a copy held in your browser. WhatsApp is the record that counts — keep that message.
      </p>

      <div className="mt-6 space-y-2 rounded-xl border border-line bg-panel p-5 text-left">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.qty}x {item.productName} — {item.brand} {item.model}
            </span>
            <span className="font-mono text-gold">{fmtNaira(item.unitPrice * item.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-white/15 pt-2 text-sm">
          <span className="text-muted">Delivery ({order.location})</span>
          <span className="font-mono">{order.shippingFee ? fmtNaira(order.shippingFee) : "Free"}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-sm text-gold">
            <span>Prepay discount</span>
            <span className="font-mono">-{fmtNaira(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-white/15 pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="font-mono text-gold">{fmtNaira(order.total)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <LinkButton href="/shop" className="sm:w-auto sm:px-8">
          Continue Shopping
        </LinkButton>
        <Link href="/" className="text-sm text-muted hover:text-white">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
