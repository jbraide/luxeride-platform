"use client";

import { useEffect } from "react";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useCartStore } from "@/store/cart";
import { fmtNaira } from "@/lib/pricing";
import { useHasMounted } from "@/lib/use-has-mounted";
import { track } from "@/lib/analytics";
import { LinkButton } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import { delivery } from "@/lib/copy";

export default function CartView() {
  const { items, removeItem, setQty, subtotal, count } = useCartStore();
  const mounted = useHasMounted();

  const itemCount = count();
  const cartSubtotal = subtotal();

  // `cart_view` (`cart-checkout` §12.2, master-build-plan M3.15) — fired once
  // the persisted cart has actually rehydrated, so the numbers are the real
  // ones. Firing before `mounted` would report an empty cart every time.
  useEffect(() => {
    if (!mounted || itemCount === 0) return;
    track("cart_view", { itemCount, subtotal: cartSubtotal });
    // Deliberately mount-scoped: a quantity change is not a new cart view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Defect D1: the persisted store rehydrates synchronously on the client, so
  // rendering it before that produces HTML the server never produced.
  if (!mounted) {
    return <StorageSkeleton title="Your Cart" note="Loading your saved cart…" />;
  }

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
                {/* Client Component: it cannot read the media manifest, so the
                    branded placeholder stands in until photography lands
                    (storefront-catalog §9, blocked on D-12). */}
                <ProductPlaceholder name={item.productName} showLabel={false} />
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
                    aria-label={`Decrease quantity of ${item.productName}`}
                    className="px-3 py-1 text-white/70 hover:text-gold"
                    onClick={() => setQty(item.id, item.qty - 1)}
                  >
                    –
                  </button>
                  <span className="w-8 text-center font-mono text-sm">{item.qty}</span>
                  <button
                    aria-label={`Increase quantity of ${item.productName}`}
                    className="px-3 py-1 text-white/70 hover:text-gold"
                    onClick={() => setQty(item.id, item.qty + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  aria-label={`Remove ${item.productName} from cart`}
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-muted hover:text-white"
                >
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
      {/* The delivery figure is quoted from the copy register, so the cart, the
          policy page and the checkout cannot disagree (`trust-and-policies`
          §5.7). It used to say "calculated at checkout" with no number at all,
          which left the biggest objection on the page unanswered. */}
      <p className="mt-1 text-xs text-muted">
        Delivery is {delivery.range()} depending on your zone.{" "}
        <a href="/delivery" className="text-gold hover:underline">
          See delivery
        </a>
      </p>

      <div className="mt-4">
        <TrustStrip variant="cta" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <LinkButton
          href="/checkout"
          className="sm:w-auto sm:px-8"
          // `InitiateCheckout` / `begin_checkout`, carrying item count and
          // subtotal (§3.5). Synchronous, so it cannot delay the navigation.
          onClick={() => track("begin_checkout", { itemCount, subtotal: cartSubtotal })}
        >
          Proceed to Checkout
        </LinkButton>
        <LinkButton href="/shop" variant="outline" className="sm:w-auto sm:px-8">
          Keep Shopping
        </LinkButton>
      </div>
    </div>
  );
}
