import type { FunnelPage } from "./sections.ts";

/**
 * `/offer` — the offer page's fixed copy.
 *
 * THE OFFER ITSELF IS NOT HERE, AND THAT IS THE POINT. The badge, headline,
 * description and the saving are read from a live `Promotion` row through
 * `loadPromotions()` and priced by `resolveDiscountForOrder()` at render time
 * (Requirement 4.3), so this file carries no figure of its own. If the page quoted a
 * number here it could disagree with what the checkout charges, which is the one
 * thing the offer page must never do (Requirement 4.4).
 *
 * The hero — the live offer, or the honest "no offer running" state — is rendered by
 * `src/app/offer/page.tsx`, because it depends on the database. `offerFallback` holds
 * the words for the state where nothing is live.
 */
export const offer: FunnelPage = {
  slug: "offer",
  metadata: {
    title: "The LuxeRide Offer",
    description:
      "Whatever offer is running on LuxeRide right now, read from the live promotion and honoured at checkout. Prepay by bank transfer, or pay the rider on delivery.",
    path: "/offer",
  },
  sections: [
    {
      kind: "prose",
      heading: "How the offer works",
      paragraphs: [
        "The offer on this page is read from a live promotion rather than from a headline somebody wrote once. It applies for as long as the promotion runs, and it comes off the same confirmed price the checkout charges.",
        "There is no code to remember and nothing to claim. The price you are quoted is the price after the discount, because the same engine that works it out here is the one that prices your order.",
      ],
    },
    {
      kind: "risk",
      items: [
        "The discount is worked out by the same pricing the checkout uses, so this page and the cart cannot disagree.",
        "Nothing is charged here. You pay the rider on delivery, or you prepay by bank transfer.",
        "Made to order for your exact car, with the fit confirmed before dispatch.",
      ],
    },
    {
      kind: "faq",
      items: [
        {
          q: "How long does the offer last?",
          a: "For as long as the promotion behind it is running. It is read live on every visit, so when the promotion ends the offer is gone from this page rather than left up as though it were still on.",
        },
        {
          q: "Do I need a code?",
          a: "No. The offer is applied by the site's own pricing, not by a code you have to type and remember.",
        },
        {
          q: "Does the offer change what delivery costs?",
          a: "Delivery is priced by your zone and shown at checkout. Prepaying by bank transfer takes the saving off the order; a pay-on-delivery order pays the rider on arrival.",
        },
      ],
    },
    {
      kind: "cta",
      primary: { label: "Shop the offer", href: "/shop" },
      secondary: { label: "Find your exact fit", href: "/fit-finder" },
    },
  ],
};

/**
 * The honest state when no promotion is live (Requirement 9.3).
 *
 * Deliberately NOT an empty offer shell and NOT a stale headline. With nothing live
 * the page says so and routes to the catalogue, rather than presenting an offer the
 * checkout would not honour.
 */
export const offerFallback = {
  title: "No offer is running right now",
  body: "We do not keep an old headline up to look busy. Everything in the shop is priced as made-to-order for your exact car, and the next offer will appear here when it starts.",
} as const;
