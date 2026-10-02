"use client";

import SafeImage from "@/components/SafeImage";
import { useCartStore } from "@/store/cart";
import { fmtNaira } from "@/lib/pricing";
import { LinkButton } from "@/components/Button";

export default function CartPage() {
  const { items, removeItem, setQty, subtotal } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-muted">Find your exact fit and add something to it.</p>
        <div className="mt-6">
          <LinkButton href="/fit-finder" className="mx-auto sm:w-auto sm:px-8">
            Find My Perfect Fit
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-2xl font-semibold">Your Cart</h1>

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-4 rounded-xl border border-line bg-panel p-4">
            {item.image && (
              <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-panel-2">
                <SafeImage src={item.image} alt="" fill className="object-cover" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-display font-semibold">{item.productName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {item.year} {item.brand} {item.model}
                {item.rows ? ` · ${item.rows}-Row` : ""}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-white/15">
                  <button
                    className="px-3 py-1 text-white/70 hover:text-gold"
                    onClick={() => setQty(item.id, item.qty - 1)}
                  >
                    –
                  </button>
                  <span className="w-8 text-center font-mono text-sm">{item.qty}</span>
                  <button
                    className="px-3 py-1 text-white/70 hover:text-gold"
                    onClick={() => setQty(item.id, item.qty + 1)}
                  >
                    +
                  </button>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-xs text-muted hover:text-white">
                  Remove
                </button>
              </div>
            </div>
            <p className="font-mono text-sm text-gold">{fmtNaira(item.unitPrice * item.qty)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-dashed border-white/15 pt-4">
        <span className="text-sm text-muted">Subtotal</span>
        <span className="font-mono text-xl font-bold text-gold">{fmtNaira(subtotal())}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Delivery fee is calculated at checkout, based on your zone.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/checkout" className="sm:w-auto sm:px-8">
          Proceed to Checkout
        </LinkButton>
        <LinkButton href="/shop" variant="outline" className="sm:w-auto sm:px-8">
          Keep Shopping
        </LinkButton>
      </div>
    </div>
  );
}
