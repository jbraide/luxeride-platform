"use client";

import Link from "next/link";
import { useOrderStore } from "@/store/order";
import { fmtNaira } from "@/lib/pricing";
import { LinkButton } from "@/components/Button";

export default function OrderConfirmationPage() {
  const order = useOrderStore((s) => s.lastOrder);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">No recent order found</h1>
        <p className="mt-2 text-muted">Start a new order from the shop.</p>
        <div className="mt-6">
          <LinkButton href="/shop" className="mx-auto sm:w-auto sm:px-8">
            Go to Shop
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold text-2xl text-gold">
        ✓
      </div>
      <h1 className="font-display text-2xl font-semibold">Order sent — check WhatsApp</h1>
      <p className="mt-2 text-sm text-muted">
        Order <span className="font-mono text-gold">{order.id}</span> was sent to WhatsApp for verification. We&apos;ll
        confirm dispatch once you reply.
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
