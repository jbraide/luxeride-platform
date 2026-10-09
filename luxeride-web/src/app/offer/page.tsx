import { Fragment } from "react";
import type { Metadata } from "next";
import { LinkButton } from "@/components/Button";
import JsonLd from "@/components/JsonLd";
import renderSection from "@/components/funnel/render-section";
import { offer, offerFallback } from "@/data/funnel/offer";
import { listProducts } from "@/lib/catalogue";
import { loadPromotions, resolveDiscountForOrder } from "@/lib/discounts-server";
import { fmtNaira } from "@/lib/pricing";
import { faqJsonLd, pageMetadata } from "@/lib/seo";

/**
 * `/offer` — the offer page the ads point at.
 *
 * A Server Component, and DYNAMIC because the offer is a database fact: the page
 * reads the live `Promotion` rows and prices the discount on every request, the same
 * way `/` does (`src/app/page.tsx`). A page that baked an offer in at build time
 * could advertise a promotion that had ended.
 *
 * THE OFFER IS NEVER WRITTEN HERE. Its words come from the live `Promotion` row and
 * its figure from `resolveDiscountForOrder`, so the page cannot quote a saving the
 * checkout would not apply (Requirement 4.3). When nothing is live, the honest "no
 * offer running" state renders instead of an empty shell (Requirement 9.3).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: offer.metadata.title,
  description: offer.metadata.description,
  path: offer.metadata.path,
});

export default async function OfferPage() {
  // One read for the catalogue and one for the promotions; `resolveDiscountForOrder`
  // then prices the discount against real lines, so the promotion we present is one
  // that actually applies to something in the shop.
  const [products, promotions] = await Promise.all([listProducts(), loadPromotions()]);

  /**
   * A REPRESENTATIVE BASKET, and why a saving needs one.
   *
   * A discount is a fact about a basket, not about a rule: a percentage depends on
   * what is in it. Using every product at its list price means any promotion scoped
   * to a product or category is represented rather than missed, and the figure shown
   * is the one the engine actually produces. It is labeled as a representative basket
   * for exactly that reason.
   */
  const outcome = await resolveDiscountForOrder({
    lines: products.map((product) => ({
      productSlug: product.slug,
      categorySlug: product.categorySlug,
      amount: product.regular,
    })),
  });

  const applied = outcome.applied;
  const livePromotion = applied
    ? (promotions.find((rule) => rule.id === applied.ruleId) ?? null)
    : null;
  const saving = applied && applied.amountOff > 0 ? applied.amountOff : 0;

  const faq: { q: string; a: string }[] = [];
  for (const section of offer.sections) {
    if (section.kind === "faq") faq.push(...section.items);
  }

  return (
    <div>
      {faq.length > 0 ? <JsonLd data={faqJsonLd(faq)!} /> : null}

      {/*
        THE HERO, IN TWO STATES. With a live promotion it names the offer and the
        saving the engine computed. With none it says so plainly — there is no stale
        headline and no empty offer slot, because both would promise something the
        checkout would not honour.
      */}
      {livePromotion && saving > 0 ? (
        <section className="border-b border-border bg-accent/10">
          <div className="mx-auto max-w-5xl px-5 py-14">
            {livePromotion.badge ? (
              <span className="rounded-md bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-on-accent">
                {livePromotion.badge}
              </span>
            ) : null}
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {livePromotion.headline ?? livePromotion.label ?? livePromotion.name}
            </h1>
            {livePromotion.description ? (
              <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">
                {livePromotion.description}
              </p>
            ) : null}
            <p className="mt-4 text-sm text-fg/85">
              Saving{" "}
              <span className="tabular font-semibold text-accent">{fmtNaira(saving)}</span> on a
              representative basket, worked out by the same pricing the checkout uses.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/shop" className="sm:w-auto sm:px-8">
                Shop the offer
              </LinkButton>
              <LinkButton href="/fit-finder" variant="outline" className="sm:w-auto sm:px-8">
                Find your exact fit
              </LinkButton>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-b border-border">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">The offer</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {offerFallback.title}
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">
              {offerFallback.body}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/shop" className="sm:w-auto sm:px-8">
                Browse the shop
              </LinkButton>
              <LinkButton href="/fit-finder" variant="outline" className="sm:w-auto sm:px-8">
                Find your exact fit
              </LinkButton>
            </div>
          </div>
        </section>
      )}

      {offer.sections.map((section, index) => (
        <Fragment key={index}>{renderSection(section)}</Fragment>
      ))}
    </div>
  );
}
