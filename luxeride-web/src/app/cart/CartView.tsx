"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import StorageSkeleton from "@/components/StorageSkeleton";
import { useCartStore } from "@/store/cart";
import { fmtNaira, MAX_LINE_QTY } from "@/lib/pricing";
import { useHasMounted } from "@/lib/use-has-mounted";
import { track } from "@/lib/analytics";
import { LinkButton } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import { delivery } from "@/lib/copy";
import { optionLabel } from "@/lib/select-variation";

export default function CartView() {
  const { items, removeItem, setQty, subtotal, count, clear } = useCartStore();
  const mounted = useHasMounted();

  /**
   * The clear-cart button's two-step confirm.
   *
   * "Clear cart" does not empty the cart on the first tap; it asks, and the second
   * tap is the one that empties it. That is not decoration — the store has had a
   * `clear()` since it was written and NOTHING called it, so emptying the cart was
   * impossible from the UI at all. The owner asked for the button (“clear the cart”),
   * and an irreversible "remove every item" that fires on one stray tap beside the
   * quantity controls is the wrong way to give it to them.
   *
   * Deliberately NOT `window.confirm()`: that blocks the main thread, is styled by the
   * browser rather than the site, and some in-app browsers suppress it entirely, which
   * would leave a button that does nothing. Two inline taps work everywhere.
   */
  const [confirmClear, setConfirmClear] = useState(false);

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
        <p className="mt-2 text-fg-muted">Find your exact fit and add something to it.</p>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Your Cart</h1>
        {/* Empty the whole cart. Two taps: the first asks, the second clears. */}
        {confirmClear ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-muted">Remove every item?</span>
            <button
              type="button"
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
              className="rounded-lg border border-[#FF6B35] px-3 py-1.5 text-xs font-semibold text-[#FF6B35] hover:bg-[#FF6B35]/10"
            >
              Yes, clear cart
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="text-xs text-fg-muted hover:text-fg"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-xs text-fg-muted underline-offset-4 hover:text-[#FF6B35] hover:underline"
          >
            Clear cart
          </button>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {items.map((item) => {
          // The cart holds one row per product per car (`cart-checkout` §7.1), so
          // two rows can carry the same product name — a 2015 Camry and a 2019
          // Camry. The controls therefore name the car as well: with the product
          // alone, every "Increase quantity of Double Layer Mats" on the page
          // was the same control as far as a screen reader was concerned.
          const car = `${item.year} ${item.brand} ${item.model}`;
          return (
            <div key={item.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
              {item.image && (
                <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {/* Client Component: it cannot read the media manifest, so the
                      branded placeholder stands in until photography lands
                      (storefront-catalog §9, blocked on D-12). */}
                  <ProductPlaceholder name={item.productName} showLabel={false} />
                </div>
              )}
              <div className="flex-1">
                <p className="font-display font-semibold">{item.productName}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {car}
                  {item.rows ? ` · ${item.rows}-Row` : ""}
                  {/* WHICH OPTION. The layer is part of the line's identity, so a cart
                      holding both layers shows two lines both reading "Floor Mats" with
                      nothing to tell them apart — and they are charged differently. */}
                  {item.variationSlug ? ` · ${optionLabel(item.variationSlug)}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-fg-muted/25">
                    <button
                      aria-label={`Decrease quantity of ${item.productName} for ${car}`}
                      className="px-3 py-1 text-fg/70 hover:text-accent"
                      // Not disabled at 1: `setLineQty` removes the line at zero,
                      // which is what §7.2 asks this control to do. It used to be a
                      // silent no-op here, so a customer at quantity one pressing
                      // "-" got no line, no change and no explanation.
                      onClick={() => setQty(item.id, item.qty - 1)}
                    >
                      –
                    </button>
                    <span className="w-8 text-center font-mono text-sm">{item.qty}</span>
                    <button
                      aria-label={`Increase quantity of ${item.productName} for ${car}`}
                      // Disabled at the ceiling `validateQty` enforces, so the cart
                      // can never hold a quantity the server would reject whole
                      // (`cart-checkout` §7.3, `commerce-backend` §5.3).
                      disabled={item.qty >= MAX_LINE_QTY}
                      className="px-3 py-1 text-fg/70 hover:text-accent disabled:cursor-not-allowed disabled:text-fg/25 disabled:hover:text-fg/25"
                      onClick={() => setQty(item.id, item.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    aria-label={`Remove ${item.productName} for ${car} from cart`}
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-fg-muted hover:text-fg"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="font-mono text-sm text-accent">{fmtNaira(item.unitPrice * item.qty)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-dashed border-fg-muted/25 pt-4">
        <span className="text-sm text-fg-muted">Subtotal</span>
        <span className="font-mono text-xl font-bold text-accent">{fmtNaira(subtotal())}</span>
      </div>
      {/* The delivery figure is quoted from the copy register, so the cart, the
          policy page and the checkout cannot disagree (`trust-and-policies`
          §5.7). It used to say "calculated at checkout" with no number at all,
          which left the biggest objection on the page unanswered. */}
      <p className="mt-1 text-xs text-fg-muted">
        Delivery is {delivery.range()} depending on your zone.{" "}
        <Link href="/policies/delivery" className="text-accent hover:underline">
          See delivery
        </Link>
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
