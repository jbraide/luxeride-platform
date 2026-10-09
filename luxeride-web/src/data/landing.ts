import type { Product } from "@/data/products";

/**
 * The campaign registry — `?product=<value>` resolved to copy and a product
 * lock.
 *
 * THE REGISTRY STAYS STATIC. An ad link is a code artifact, and keeping it in git
 * is what makes it reviewable (`ad-landing-and-tracking` §1.5). What is no longer
 * static is the answer to "does the catalogue still sell the product this campaign
 * names". That used to be checked against the `PRODUCTS` array in
 * `src/data/products.ts`, so a product created in `/admin/products` could never be
 * advertised and a deleted one kept an ad link. Existence is now read from the
 * DATABASE (Requirement 9.1, 9.3).
 *
 * WHY THE CHECK IS NOT IN `resolveCampaign` ITSELF.
 *
 * `resolveCampaign` is also called from the browser — `PageView` and
 * `lib/analytics/attribution.ts` resolve `?product=` to an analytics key — and a
 * Client Component cannot import `@/lib/catalogue` without dragging Prisma into
 * every browser bundle. So the resolver is split: `resolveCampaign` stays
 * synchronous and reads only the registry, and `resolveCampaignFromCatalogue`
 * takes the caller's own `getProduct` and validates existence server-side, where
 * the database is reachable.
 *
 * One parameter, one resolver, honoured on both `/` and `/fit-finder`. Adding a
 * campaign is one entry here; the slug is whatever goes after `?product=` in the
 * ad URL.
 *
 * `{em}...{em}` wraps the phrase that is highlighted in gold. It is split and
 * rendered as a `<span className="text-accent">` server-side — NEVER written with
 * `innerHTML` the way the prototype did
 * (`luxeride-funnel (2).html:729`), so a campaign string can never inject markup.
 */

export interface CampaignLanding {
  /** Ad-facing key. What goes after `?product=` in the ad URL. */
  slug: string;
  /**
   * A catalogue product slug — locks the funnel's product step away. Validated
   * against the database at request time by `resolveCampaignFromCatalogue`, not
   * against the static `PRODUCTS` array.
   */
  productSlug: string;
  /**
   * WHICH OPTION of that product the ad is for, when the ad is for one option.
   *
   * Added 2026-10-05, and it is what the two mat campaigns became when single layer
   * and double layer stopped being products. `?product=mats` used to mean "the double
   * layer mats product"; pointing it at `floor-mats` alone would have silently dropped
   * what the ad was selling and locked the visitor into whichever layer the funnel
   * happened to ask for first. So the ad locks the LAYER as well as the product —
   * the funnel skips the layer question and opens on the option the ad named.
   *
   * Optional: most campaigns are for a whole product and name no option.
   */
  variationSlug?: string;
  /** Plain text with `{em}` markers around the gold-highlight phrase. */
  headline: string;
  sub: string;
  /**
   * Only offers the checkout already honours (`ad-landing-and-tracking` §1.6).
   * At P0 the single allowed offer is the ₦2,000 prepay saving, because nothing
   * else is honoured anywhere in the funnel or the WhatsApp quote.
   */
  offer?: string;
  /** Short human label for the ad-ops report: "Mats — IG Q3". */
  label: string;
}

/**
 * The one offer string a campaign is permitted to declare. The checkout honours
 * exactly this — `checkout/CheckoutView.tsx` discounts ₦2,000 when the payment
 * method is prepay. A campaign that names any other figure is rejected at module
 * load rather than shipping a headline the funnel would contradict.
 */
export const ALLOWED_OFFER = "Save ₦2,000 with bank transfer";

/** The hero copy that ships today, used whenever nothing resolves (§1.9). */
export const DEFAULT_HEADLINE = "Custom-Fit Car Accessories for {em}Your Exact Car{em}";
export const DEFAULT_SUB =
  "Laser-measured mats, seat covers, cargo liners and more. Fully waterproof. Pay on delivery, nationwide.";

/**
 * The four prototype aliases, preserving `CONFIG.PRODUCT_LANDING` and its copy
 * verbatim (`luxeride-funnel (2).html:671-690`), so ad links built against the
 * validated funnel keep working (§1.4).
 */
export const CAMPAIGN_LANDINGS: Record<string, CampaignLanding> = {
  mats: {
    slug: "mats",
    productSlug: "floor-mats",
    // This ad has always been the double-layer one — it is the campaign the copy
    // ("fully waterproof") describes and the one `full-bundle` is built on. Saying so
    // here is what keeps the layer the ad sold from being decided by the funnel.
    variationSlug: "double-layer",
    headline: "Custom-Fit Mats for {em}Your Exact Car{em}",
    sub: "Laser-measured to your model. Fully waterproof. Pay on delivery.",
    offer: ALLOWED_OFFER,
    label: "Mats — IG Q3",
  },
  "single-layer": {
    slug: "single-layer",
    productSlug: "floor-mats",
    variationSlug: "single-layer",
    headline: "Custom-Fit Mats for {em}Your Exact Car{em}",
    sub: "Laser-measured top-layer protection. Pay on delivery.",
    offer: ALLOWED_OFFER,
    label: "Single Layer — IG",
  },
  "seat-covers": {
    slug: "seat-covers",
    productSlug: "seat-covers",
    headline: "Custom-Fit Seat Covers for {em}Your Exact Car{em}",
    sub: "Tailored to your seats. Premium finish. Pay on delivery.",
    offer: ALLOWED_OFFER,
    label: "Seat Covers — IG",
  },
  bundle: {
    slug: "bundle",
    productSlug: "full-bundle",
    headline: "The Full Interior Upgrade for {em}Your Exact Car{em}",
    sub: "Double layer mats + seat covers, laser-measured. Pay on delivery.",
    offer: ALLOWED_OFFER,
    label: "Bundle — IG",
  },
};

export interface ResolvedLanding {
  raw: string;
  /** `null` when the value resolved as a bare product slug rather than an alias. */
  campaignSlug: string | null;
  productSlug: string;
  /** Which option the ad locked, when it named one. See `CampaignLanding`. */
  variationSlug?: string;
  headline: string;
  sub: string;
  offer?: string;
  /** Drives the fallback event and the analytics `campaign` key. */
  match: "campaign" | "product" | "unknown";
}

/**
 * The assertion behind §2.6 and §1.6 — run at module load so a campaign whose key
 * and slug disagree, or that declares an offer the checkout does not honour,
 * breaks the build rather than an ad.
 *
 * It no longer checks that `productSlug` exists. That is a database question, and
 * this module runs in the browser too, so it is answered at request time by
 * `resolveCampaignFromCatalogue` — a stale ad link must not resolve silently
 * (Requirement 8.2, 9.3).
 *
 * It is exported so it can also be called from a test once one exists.
 */
export function assertCampaignLandings(): void {
  for (const [key, landing] of Object.entries(CAMPAIGN_LANDINGS)) {
    if (key !== landing.slug) {
      throw new Error(
        `landing.ts: campaign key "${key}" does not match its slug "${landing.slug}".`,
      );
    }
    if (!landing.headline.trim() || !landing.sub.trim()) {
      throw new Error(`landing.ts: campaign "${key}" is missing a headline or a sub.`);
    }
    // §1.6 / §2.5: only an offer the checkout honours.
    if (landing.offer !== undefined && landing.offer !== ALLOWED_OFFER) {
      throw new Error(
        `landing.ts: campaign "${key}" declares offer ${JSON.stringify(landing.offer)}, which the checkout does not honour. Allowed: ${JSON.stringify(ALLOWED_OFFER)}.`,
      );
    }
  }
}

assertCampaignLandings();

/**
 * The registry half of the resolver — synchronous and BROWSER-SAFE by design.
 *
 * Order is load-bearing (§1.3): campaign aliases are tried BEFORE product slugs,
 * so `seat-covers` — which is both — gets the campaign copy and the product lock.
 * A miss on an absent or empty value returns `null`; it never throws and never
 * returns a partial campaign.
 *
 * A value that is not a campaign alias comes back as a PRODUCT-SLUG CANDIDATE
 * (`match: "product"`). Whether the catalogue actually sells it is not a question
 * this function can answer without Postgres, so `resolveCampaignFromCatalogue`
 * settles it on the server.
 */
export function resolveCampaign(raw?: string | null, requestedVariation?: string | null): ResolvedLanding | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (value === "") return null;

  const campaign = CAMPAIGN_LANDINGS[value];
  if (campaign) {
    return {
      raw: value,
      campaignSlug: campaign.slug,
      productSlug: campaign.productSlug,
      // The CAMPAIGN's option wins over the query: an ad for the single layer must not
      // be steerable into the double one by editing the URL, which would make the ad's
      // promise and what the funnel sells disagree. Its existence is checked against
      // the product's real options by `resolveCampaignFromCatalogue`.
      variationSlug: campaign.variationSlug,
      headline: campaign.headline,
      sub: campaign.sub,
      offer: campaign.offer,
      match: "campaign",
    };
  }

  // A bare product slug locks the product but shows the default hero copy: the
  // campaign copy is only earned by a campaign alias (`fit-finder` §8.3).
  //
  // An OPTION MAY COME WITH IT, and that is the path the PDP's own CTA takes:
  // `?product=floor-mats&variation=double-layer`. Without carrying it the layer a
  // customer just picked on the product page would be dropped on the way into the
  // funnel, and the funnel would ask — or worse, not ask — on its own. It is carried
  // through here and validated against the product's OWN options by
  // `resolveCampaignFromCatalogue`; an option the product does not sell locks
  // nothing rather than being discovered later.
  const requested = requestedVariation?.trim() ?? "";
  return {
    raw: value,
    campaignSlug: null,
    productSlug: value,
    variationSlug: requested === "" ? undefined : requested,
    headline: DEFAULT_HEADLINE,
    sub: DEFAULT_SUB,
    match: "product",
  };
}

/**
 * The catalogue half of the resolver — async, and SERVER-ONLY in practice.
 *
 * `lookup` is the caller's own `getProduct` from `@/lib/catalogue`. It is passed in
 * rather than imported because this module is in the browser bundle (see the file
 * header): importing Prisma here would ship it to every client.
 *
 * A campaign — or a bare `?product=` slug — that names something the catalogue no
 * longer sells resolves to `null`, so the page falls back to its standing hero copy
 * instead of locking onto a product that is gone (Requirement 8.2, 9.3). The
 * refusal is logged, so a stale ad link is a loud gap in the server log rather than
 * a page that quietly stopped matching its ad.
 */
export async function resolveCampaignFromCatalogue(
  raw: string | null | undefined,
  requestedVariation: string | null | undefined,
  lookup: (slug: string) => Promise<Product | undefined>,
): Promise<ResolvedLanding | null> {
  const landing = resolveCampaign(raw, requestedVariation);
  if (landing === null) return null;

  const product = await lookup(landing.productSlug);
  if (!product) {
    console.error(
      `landing.ts: "${landing.productSlug}" is not in the catalogue; not resolving ${JSON.stringify(landing.raw)}.`,
    );
    return null;
  }

  if (landing.match === "campaign") {
    // §2.3 for options. A campaign naming an option the product does not sell would
    // lock the funnel on a layer nothing can be priced from — and it would fail at the
    // customer's first price, not at the build, which is the wrong place to find out.
    // Refuse the whole campaign rather than shipping the ad's promise over a layer
    // that is gone.
    if (
      landing.variationSlug !== undefined &&
      !product.variations?.some((variation) => variation.slug === landing.variationSlug)
    ) {
      console.error(
        `landing.ts: campaign "${landing.campaignSlug}" names variationSlug "${landing.variationSlug}", which is not an option of ${landing.productSlug}.`,
      );
      return null;
    }
    return landing;
  }

  // A bare product slug keeps the named option only when the product sells it; an
  // option it does not sell locks nothing rather than being passed on.
  const variationSlug =
    landing.variationSlug !== undefined &&
    product.variations?.some((variation) => variation.slug === landing.variationSlug)
      ? landing.variationSlug
      : undefined;
  return { ...landing, variationSlug };
}

/** The short key the analytics layer and the WhatsApp ref line carry (§6.5). */
export function campaignKeyFor(resolved: ResolvedLanding | null): string {
  if (!resolved) return "(not set)";
  return resolved.campaignSlug ?? resolved.productSlug;
}
