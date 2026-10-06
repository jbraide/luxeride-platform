import Link from "next/link";
import { LinkButton } from "@/components/Button";
import { TrustStrip } from "@/components/TrustStrip";
import type { Product } from "@/data/products";
import { formatDeliverySummary, formatPriceFrom } from "@/lib/availability";
import ProductFaq from "@/components/ProductFaq";
import { describeBundleContents } from "@/lib/bundle-price";
import { fmtNaira } from "@/lib/pricing";
import { MAT_TYPE_VARIATION } from "@/data/fitment-catalogue";

/**
 * Whether these options are the two mat LAYERS, rather than options of some other
 * kind.
 *
 * Only Floor Mats's options are layers today, but "Which layer?" is the question worth
 * asking and "Which option?" is a worse one, so the heading follows the data rather
 * than being hard-coded to one product.
 */
const LAYER_OPTION_SLUGS: ReadonlySet<string> = new Set(Object.values(MAT_TYPE_VARIATION));

/**
 * The PDP buy column (`storefront-catalog` §10.2).
 *
 * Extracted from the route so the page file is about routing and metadata, and
 * the buy column is one reviewable unit. A Server Component: it holds no state,
 * so nothing here costs a client bundle, and the CTA is a real `<a>` that works
 * before hydration.
 *
 * The price is a BAND and never one number (§7.3) — a single figure is one the
 * WhatsApp quote can contradict. There is no availability claim anywhere: no
 * code path establishes stock for a specific car, so the honest sentence is
 * that the item is made to order.
 *
 * THE OPTION PICKER, since 2026-10-05. A product with more than one option has to
 * let the customer say which one, and Floor Mats is the case that forced it: its two
 * options are the single and double layer, at different prices, and there is no other
 * screen in the funnel that can settle which was wanted.
 *
 * It is LINKS, not a client state machine, and that is a deliberate choice rather than
 * the simplest-looking one. Each option is a plain `<a>` to the same page with
 * `?variation=` set, so the choice works with JavaScript off, before hydration, and
 * survives a refresh, and the URL says what was chosen. It also means the 307 from
 * `/products/double-layer-mats` has a real destination — a query the page already
 * understands — instead of arriving at a product that cannot say which layer it meant.
 */
export function BuyBox({
  product,
  selectedSlug = null,
}: {
  product: Product;
  /** The option the `?variation=` query named, resolved against the product. */
  selectedSlug?: string | null;
}) {
  const bundle = product.bundle;
  const options = product.variations ?? [];
  const selected = options.find((option) => option.slug === selectedSlug) ?? null;

  /*
   * WHAT THE PRICE SAYS. With an option chosen the band belongs to THAT option — the
   * whole product's band would put the single-layer figure beside a double-layer
   * selection and read as "this is what it costs", which is the one thing a band must
   * not do. With none chosen the product's own band stands, which is what the band was
   * always for.
   *
   * Built by OVERLAYING the option's figures onto the product rather than by teaching
   * `formatPriceFrom` about options: the band function already computes "the cheapest
   * and dearest this can be, across tier and row count", and the option IS such a
   * product as far as that arithmetic is concerned.
   *
   * `variations` is DROPPED in the overlay, and that is load-bearing rather than
   * incidental. `priceRange()` reads the options list when there is one and ignores
   * `regular`/`premium` entirely, so leaving it in place meant a double-layer
   * selection still printed the whole product's ₦45,000–₦94,000 band beside a "Double
   * Layer" label — which is the exact "this is what it costs" claim a band must not make.
   */
  const pricedFor: Product = selected
    ? {
        ...product,
        variations: undefined,
        regular: selected.regular,
        premium: selected.premium,
        rowApplicable: selected.rowApplicable,
        threeRowSurcharge: selected.threeRowSurcharge ?? undefined,
      }
    : product;
  const price = formatPriceFrom(pricedFor);

  /*
   * WHAT A BUNDLE IS MADE OF, AND WHAT IT SAVES.
   *
   * The contents come from the bundle's PARTS, not from prose. The old bundle said what
   * was inside in a hand-written `note`, which is the reason it could only ever be one
   * composition: there was nowhere to say "single layer mats with covers" or "mats with a
   * boot liner", and nowhere for the price to come from.
   *
   * The saving is the parts' total less this bundle's price, at the LOW end of the band.
   * A band means a regular-brand and a premium-brand customer pay different amounts, so
   * quoting one saving over a range would overstate what the cheaper of them saves. The
   * low figure is the one that is true for both.
   *
   * Rendered only when there is a bundle AND it has parts: a bundle still being built in
   * `/admin` has no parts yet, and printing an empty "what's inside" heading is worse
   * than printing nothing.
   */
  const contents = bundle && bundle.items.length > 0 ? describeBundleContents(bundle.items) : [];
  const saved = bundle ? Math.max(0, bundle.listRegular - product.regular) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{product.name}</h1>
      <p className="mt-2 text-fg-muted">{product.note}</p>

      <p className="mt-5 font-mono text-2xl font-bold text-accent">{price.from}</p>
      <p className="mt-1 text-xs text-fg-muted">
        {selected ? `${selected.name} · ` : ""}
        {price.range} — {price.reason}
      </p>

      {/*
        THE PICKER, ABOVE THE SAVING LINE. It answers "which one am I buying", which is
        a different question from "what does it save", and burying the choice under a
        bundle figure is how a customer ends up saving money on the wrong layer.
      */}
      {options.length > 1 && (
        <fieldset className="mt-5">
          <legend className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
            {options.length === 2 && options.some((o) => LAYER_OPTION_SLUGS.has(o.slug))
              ? "Which layer?"
              : "Which option?"}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => {
              const isSelected = option.slug === selectedSlug;
              return (
                <Link
                  key={option.slug}
                  href={`/products/${product.slug}?variation=${encodeURIComponent(option.slug)}`}
                  aria-current={isSelected ? "true" : undefined}
                  className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                    isSelected
                      ? "border-accent bg-surface-2 font-semibold text-accent"
                      : "border-fg-muted/25 bg-surface text-fg-80 hover:border-accent hover:text-accent"
                  }`}
                >
                  {option.name}
                  <span className="ml-2 font-mono text-xs text-accent-dim">
                    {fmtNaira(option.regular)}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            {selected
              ? "Prices above are for the option you picked. The Fit Finder will confirm it is cut for your car."
              : "Prices vary by option, and by your car. Pick one and the Fit Finder will confirm the fit and the exact price."}
          </p>
        </fieldset>
      )}

      {/*
        THE SAVING, ABOVE THE DELIVERY LINES RATHER THAN BESIDE THE PRICE.
        It answers "why would I buy this instead of the two things separately", which is
        the only question a bundle raises — so it goes directly under the price rather
        than in a section the visitor has to scroll to find.
      */}
      {contents.length > 0 && saved > 0 && (
        <p className="mt-2 inline-block rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-accent">
          Saves {fmtNaira(saved)} vs buying the parts separately
        </p>
      )}

      {contents.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface/60 px-4 py-4">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
            What&apos;s in this bundle
          </h2>
          <ul className="mt-2 space-y-1.5">
            {contents.map((line) => (
              <li key={line} className="text-sm text-fg/85">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-fg-muted">
            {bundle
              ? `The ${bundle.items.length} part${bundle.items.length === 1 ? "" : "s"} come to ${fmtNaira(
                  bundle.listRegular,
                )} on their own.`
              : null}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-fg-muted">{product.availability}</p>
      <p className="mt-3 text-xs text-fg-muted">{formatDeliverySummary()}</p>

      <div className="mt-6">
        {/* The layer travels INTO the funnel. `?product=` alone locks the product and
            skips the layer question, which for a two-option product means the customer
            is quoted the product's floor without ever being asked — so the option is
            carried here whenever one is selected. */}
        <LinkButton
          href={`/fit-finder?product=${product.slug}${
            selectedSlug ? `&variation=${encodeURIComponent(selectedSlug)}` : ""
          }`}
        >
          Select My Car &amp; Add to Cart
        </LinkButton>
      </div>

      <div className="mt-4">
        <TrustStrip variant="cta" />
      </div>

      <ProductFaq product={product} />
    </div>
  );
}