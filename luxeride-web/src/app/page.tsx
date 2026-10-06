import type { Metadata } from "next";
import Link from "next/link";

import CategoryTile from "@/components/CategoryTile";
import ProductCard from "@/components/ProductCard";
import ProductImage from "@/components/ProductImage";
import { listCategories, listProductsWithSales } from "@/lib/catalogue";
import { loadPromotions, resolveDiscountForOrder } from "@/lib/discounts-server";
import { resolveHero } from "@/lib/hero";
import { resolveAllMedia } from "@/lib/media-manifest";
import { resolveCampaign } from "@/data/landing";
import { pageMetadata } from "@/lib/seo";

/**
 * `/` — the shop front.
 *
 * ── WHAT CHANGED AND WHY (2026-10-05) ───────────────────────────────────────
 *
 * The homepage was a campaign banner, five text tiles and four cards. The owner
 * dropped in a photograph and asked for a real e-commerce homepage, so:
 *
 *   - the hero is now a full-bleed photograph (`public/banners/hero.json`) with the
 *     text overlaid and scrimmed, falling back to a typographic hero when the file is
 *     absent — a missing banner must leave a page that still reads well, because a page
 *     that 500s without an image is worse than a page with no image;
 *   - products are read through `listProductsWithSales()`, so a live promotion shows a
 *     struck-through price and a badge on the card, resolved on the SERVER;
 *   - the featured row picks the products that actually HAVE photography rather than
 *     the first four alphabetically, because a row of placeholder tiles above the fold
 *     is what made this look unfinished;
 *   - the category row became image tiles;
 *   - an offer band appears when a promotion is live.
 *
 * NOTE: reading `searchParams` makes `/` dynamic rather than static
 * (`ad-landing-and-tracking` §3.1 requires it). The query string is the campaign's
 * lifetime and is deliberately left in the address bar untouched — never canonicalised
 * away (§1.7, §3.7).
 */
export const metadata: Metadata = pageMetadata({
  title: "LuxeRide Nigeria — Custom-Fit Car Accessories",
  description:
    "Laser-measured TPE floor mats, seat covers, cargo liners, mud flaps and sun shades, made to order for your exact car. Pay on delivery nationwide.",
  path: "/",
});

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  const landing = resolveCampaign(product);

  const [products, categories, promotions] = await Promise.all([
    listProductsWithSales(),
    listCategories(),
    loadPromotions(),
  ]);

  /**
   * THE SEASONAL HEADLINE, AND HOW THE SWITCH ACTUALLY WORKS.
   *
   * There is no season table and no `season.ts`. A season IS a `Promotion` row, and
   * the hero reads its `headline` and `description` — which is why switching to
   * Christmas is an admin change and not a deploy.
   *
   * The ORDER matters and is the whole precedence rule:
   *
   *   1. A campaign (?product=…) wins. Someone who clicked an ad for the Double Layer
   *      Mats must see the ad's promise, not whatever season is running, or the page
   *      stops saying what the ad said — which is an ad-review rejection, not a
   *      conversion loss.
   *   2. Otherwise a live promotion's headline is the hero. THIS IS THE SEASON.
   *   3. Otherwise the standing copy.
   *
   * "Live" means in its date window, so a Christmas headline cannot sit on the site in
   * June because nobody switched it off.
   */
  const seasonal = promotions.find(
    (rule) =>
      (rule.startsAt === null || rule.startsAt <= new Date()) &&
      (rule.endsAt === null || rule.endsAt >= new Date()),
  );

  const heroHeadline = landing?.headline ?? seasonal?.headline ?? "Custom-fit interiors, made for your exact car";
  const heroSub =
    landing?.sub ??
    seasonal?.description ??
    "Laser-measured floor mats, seat covers and cargo liners, cut to your model and year. Pay on delivery, nationwide.";

  // THE SEASONAL BANNER IMAGE. A promotion that carries `image` owns the hero
  // photograph; absent, the standing banner file (`public/banners/hero.json`) is the
  // fallback. That is the whole mechanism: one source for the season's words and its
  // image, so the banner does not have to be rebuilt when the season changes.
  const hero = resolveHero(seasonal?.image ?? null);

  /**
   * FEATURED PICKS THE PHOTOGRAPHED ONES.
   *
   * Alphabetical order put "Cargo Liner" and "Full Bundle" — two products with no
   * photography at all — above the fold, so the first thing a visitor saw was two
   * placeholder tiles. Sorting by "has an image" first, and keeping the existing order
   * within each group, means the row shows the catalogue at its best while every
   * product still appears further down and on `/shop`.
   *
   * A tie at zero images would leave a row of placeholders again, so the top-up is
   * deliberately allowed to fall back rather than render a short row.
   */
  const mediaBySlug = resolveAllMedia(products.map((p) => p.slug));
  const hasPhoto = (slug: string): boolean => (mediaBySlug[slug]?.images.length ?? 0) > 0;
  const ordered = [
    ...products.filter((p) => hasPhoto(p.slug)),
    ...products.filter((p) => !hasPhoto(p.slug)),
  ];
  const featured = ordered.slice(0, 4);

  /**
   * THE OFFER BAND.
   *
   * Built from the LIVE promotions rather than from a hardcoded string, so switching
   * what the homepage advertises is an admin change: a `Promotion` with a `label` and a
   * `badge` appears here, and removing the promotion removes the band. That is the
   * seasonal switch the owner asked for, in its first form.
   *
   * The figure shown is the SAVING on a representative basket, not a made-up headline
   * number: `resolveDiscountForOrder` prices the shop's own confirmed prices, so the
   * band cannot advertise a discount the engine would not actually apply.
   */
  const offer = await resolveDiscountForOrder({
    lines: featured.map((p) => ({
      productSlug: p.slug,
      categorySlug: p.categorySlug,
      amount: p.regular,
    })),
  });
  const livePromotion = promotions.find(
    (rule) => rule.label && rule.badge && rule.id === offer.applied?.ruleId,
  );

  return (
    <div>
      {/*
        THE HERO, IN THREE LAYOUTS.

        `data-hero` is on `<html>`, written by the root layout from the `heroLayout`
        setting the admin controls. The owner's brief was "side or full-width, the way
        top brands are", so the choice is editorial and settable without editing this
        file.

        This section carries `hero-shell`/`hero-copy`/`hero-art` and NOTHING else — no
        second `data-hero`. The attribute used to be duplicated here, on the very
        element the stylesheet selects as an ancestor, which is why two of the three
        layouts could never apply.

        `split` is the default and what the site has looked like: one column on a
        phone — copy first, because the photograph above the words pushed them below the
        fold — and two equal columns above `lg`. `side` is the art-forward two-column
        variant. `full` runs the photograph edge to edge with the copy over it and a
        directional scrim behind the copy: a flat wash would hide the photograph on the
        half that has nothing written on it.
      */}
      <section className="hero-shell relative isolate overflow-hidden border-b border-border bg-surface-2">
        <div className="hero-copy mx-auto w-full max-w-6xl px-5 py-14 lg:py-24">
          <div className="relative z-10">
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              {heroHeadline}
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">{heroSub}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/fit-finder"
                className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition hover:opacity-90"
              >
                Find your exact fit
              </Link>
              <Link
                href="/shop"
                className="rounded-full border border-border px-6 py-3 text-sm text-fg/85 transition hover:border-accent hover:text-accent"
              >
                Browse the shop
              </Link>
            </div>
          </div>
        </div>

        {hero ? (
          // `priority` is deliberate and is the ONE place it belongs: this is the largest
          // contentful paint on the site, and the guidance in `ProductCard` not to use it
          // is about a card in a grid, not about the hero.
          <div className="hero-art relative aspect-[4/3] w-full overflow-hidden lg:aspect-[16/10]">
            <ProductImage
              media={{ images: [hero] }}
              name="LuxeRide"
              sizes="100vw"
              className="object-cover"
              preload
            />
          </div>
        ) : (
          // No photograph. A typographic panel rather than an empty box — in `full` the
          // copy sits on the surface colour on its own and still reads as a hero.
          <div className="hero-art hidden lg:block" />
        )}
      </section>

      {/* ── The offer band ──────────────────────────────────────────────────── */}
      {livePromotion && (
        <section className="border-b border-border bg-accent/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold uppercase text-on-accent">
                {livePromotion.badge}
              </span>
              <p className="text-sm text-fg/85">
                {/* HEADLINE OR NAME, NEVER BOTH.
                    A seasonal headline is normally written to stand alone — "Christmas:
                    10% off everything" — so printing the name beside it read
                    "Christmas: Christmas: 10% off everything". The headline is the
                    longer, better sentence, so it wins outright. */}
                <span className="font-semibold text-accent">
                  {livePromotion.headline ?? livePromotion.name}
                </span>
                {!livePromotion.headline && " — on now"}
                {offer.applied && offer.applied.amountOff > 0 && (
                  <span className="tabular ml-2 font-mono text-xs text-fg-muted">
                    saves {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(offer.applied.amountOff)}
                  </span>
                )}
              </p>
            </div>
            <Link
              href="/shop"
              className="shrink-0 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Shop the sale →
            </Link>
          </div>
        </section>
      )}

      {/* ── Featured ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Featured</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Made to order for your exact model and year.
            </p>
          </div>
          <Link href="/shop" className="shrink-0 text-sm text-accent-dim hover:text-accent">
            View all →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {featured.map((p, i) => (
            // §14.4: a preload hint for the first row only, everything else lazy.
            // `preload`, never `priority` — Next 16 deprecated the latter.
            <ProductCard key={p.slug} product={p} media={mediaBySlug[p.slug] ?? null} preload={i < 2} />
          ))}
        </div>
      </section>

      {/* ── Categories, as image tiles ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-2xl font-semibold">Shop by category</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <CategoryTile key={c.slug} category={c} />
          ))}
        </div>
      </section>

      {/* ── Why ─────────────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-3">
          {[
            {
              title: "Made for your exact car",
              body: "Measured to your model and year, not trimmed from a universal set. We confirm the fit before we cut.",
            },
            {
              title: "Pay on delivery",
              body: "Nothing to pay up front. The rider collects cash or a transfer when your order arrives.",
            },
            {
              title: "Nationwide",
              body: "Delivered across all 36 states and the FCT, with an honest estimate before you order.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
