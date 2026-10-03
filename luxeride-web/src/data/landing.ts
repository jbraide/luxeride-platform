import { getProductBySlug } from "@/data/products";

/**
 * The campaign registry — `?product=<value>` resolved to copy and a product
 * lock. A plain static-TS data module, matching `src/data/products.ts`,
 * `src/data/cars.ts` and `src/data/locations.ts`: no DB, no CMS, no fetch
 * (`ad-landing-and-tracking` §1.5).
 *
 * One parameter, one resolver, honoured on both `/` and `/fit-finder`. Adding a
 * campaign is one entry here; the slug is whatever goes after `?product=` in the
 * ad URL.
 *
 * `{em}...{em}` wraps the phrase that is highlighted in gold. It is split and
 * rendered as a `<span className="text-gold">` server-side — NEVER written with
 * `innerHTML` the way the prototype did
 * (`luxeride-funnel (2).html:729`), so a campaign string can never inject markup.
 */

export interface CampaignLanding {
  /** Ad-facing key. What goes after `?product=` in the ad URL. */
  slug: string;
  /** A `PRODUCTS[].slug` — locks the funnel's product step away. */
  productSlug: string;
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
    productSlug: "double-layer-mats",
    headline: "Custom-Fit Mats for {em}Your Exact Car{em}",
    sub: "Laser-measured to your model. Fully waterproof. Pay on delivery.",
    offer: ALLOWED_OFFER,
    label: "Mats — IG Q3",
  },
  "single-layer": {
    slug: "single-layer",
    productSlug: "single-layer-mats",
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
  headline: string;
  sub: string;
  offer?: string;
  /** Drives the fallback event and the analytics `campaign` key. */
  match: "campaign" | "product" | "unknown";
}

/**
 * The assertion behind §2.6 and §1.6 — run at module load so a renamed product
 * or an offer the checkout does not honour breaks the build rather than an ad.
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
    // §2.3: an entry naming a product that no longer exists must be treated as
    // wholly unresolved. Failing at build time is the earliest possible check.
    if (!getProductBySlug(landing.productSlug)) {
      throw new Error(
        `landing.ts: campaign "${key}" names productSlug "${landing.productSlug}", which is not in PRODUCTS.`,
      );
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
 * The single resolver. Order is load-bearing (§1.3): campaign aliases are tried
 * BEFORE product slugs, so `seat-covers` — which is both — gets the campaign copy
 * and the product lock. A miss returns `null`; it never throws and never returns
 * a partial campaign.
 */
export function resolveCampaign(raw?: string | null): ResolvedLanding | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (value === "") return null;

  const campaign = CAMPAIGN_LANDINGS[value];
  if (campaign) {
    // Defensive: a renamed product invalidates the whole entry (§2.3).
    if (!getProductBySlug(campaign.productSlug)) return null;
    return {
      raw: value,
      campaignSlug: campaign.slug,
      productSlug: campaign.productSlug,
      headline: campaign.headline,
      sub: campaign.sub,
      offer: campaign.offer,
      match: "campaign",
    };
  }

  const product = getProductBySlug(value);
  if (product) {
    // A bare product slug locks the product but shows the default hero copy:
    // the campaign copy is only earned by a campaign alias (`fit-finder` §8.3).
    return {
      raw: value,
      campaignSlug: null,
      productSlug: product.slug,
      headline: DEFAULT_HEADLINE,
      sub: DEFAULT_SUB,
      match: "product",
    };
  }

  return null;
}

/** The short key the analytics layer and the WhatsApp ref line carry (§6.5). */
export function campaignKeyFor(resolved: ResolvedLanding | null): string {
  if (!resolved) return "(not set)";
  return resolved.campaignSlug ?? resolved.productSlug;
}
