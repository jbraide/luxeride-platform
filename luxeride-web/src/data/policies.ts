import { LOCATIONS } from "@/data/locations";

/**
 * The policy content module (`storefront-catalog` §5.5).
 *
 * A typed static record: no database, no CMS. `delivery` is populated
 * COMPLETELY from `LOCATIONS` so no zone, fee or ETA is retyped. The other three
 * carry clearly-marked owner-input slots rather than invented legal text —
 * `scripts/check-placeholders.mjs` fails while any remain (`trust-and-policies`
 * §12.1 and M4.10). The slot token is written inline, not via a constant, so the
 * scan can see every one of them.
 */

export type PolicySlug = "delivery" | "returns" | "privacy" | "terms";

export interface PolicySection {
  /** Stable anchor id. */
  id: string;
  heading: string;
  body: string[];
}

export interface Policy {
  slug: PolicySlug;
  title: string;
  /** One-line summary shown under the heading. */
  summary: string;
  updatedAt: string;
  sections: PolicySection[];
}

const zoneNames = LOCATIONS.map((l) => l.name).join(", ");

export const POLICIES: Record<PolicySlug, Policy> = {
  delivery: {
    slug: "delivery",
    title: "Delivery",
    summary:
      "Where we deliver, what it costs and how long it takes — every figure read from the same delivery zones the checkout uses.",
    updatedAt: "2026-10-03",
    sections: [
      {
        id: "process",
        heading: "How delivery works",
        body: [
          "We make your item to order for your exact car. Once your details are confirmed on WhatsApp, we dispatch and the rider brings it to you.",
          "You pay on delivery, or by bank transfer where you have chosen to prepay. Nothing is charged when you place the order.",
        ],
      },
      {
        id: "zones",
        heading: "Zones, fees and timings",
        body: [
          "Your zone's exact fee and window are shown at checkout and repeated in your WhatsApp order message. The table below is the same data.",
          `We currently deliver to: ${zoneNames}. Anywhere else is quoted individually on WhatsApp.`,
        ],
      },
      {
        id: "failure",
        heading: "If a delivery cannot be completed",
        body: [
          "If the rider cannot reach you, we will contact you on WhatsApp to arrange another attempt or another address. A fee may apply for a repeat trip to a distant zone.",
        ],
      },
      {
        id: "service-area",
        heading: "Service area",
        body: [
          "We deliver nationwide. The zones above are the ones with published fees and windows; anything outside them is quoted on WhatsApp before you commit.",
        ],
      },
    ],
  },
  returns: {
    slug: "returns",
    title: "Returns & Guarantee",
    summary:
      "What the fit guarantee actually promises, and how to use it if something does not fit.",
    updatedAt: "2026-10-03",
    sections: [
      {
        id: "guarantee",
        heading: "The fit guarantee",
        body: [
          "If the item we send does not fit the car we confirmed it for, we will swap it. That is the whole promise: a swap, not a refund by default.",
          "[[OWNER INPUT REQUIRED: define \"swap\" operationally — who pays return shipping, the time limit for a claim, how many times per order, and exactly which products are in scope.]]",
        ],
      },
      {
        id: "claim",
        heading: "How to make a claim",
        body: [
          "Message us on WhatsApp with your order reference and a photo of the item in the car. We will confirm the swap and arrange collection.",
        ],
      },
      {
        id: "non-fit-returns",
        heading: "Returns that are not about fit",
        body: [
          "[[OWNER INPUT REQUIRED: state the position on change-of-mind returns, wrong-address deliveries and any restocking fee.]]",
        ],
      },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "Privacy",
    summary:
      "What we collect, why, how long we keep it, and what we never send to an advertising platform.",
    updatedAt: "2026-10-03",
    sections: [
      {
        id: "controller",
        heading: "Who is responsible",
        body: [
          "[[OWNER INPUT REQUIRED: the registered company name, registration number, registered address and a privacy contact.]]",
        ],
      },
      {
        id: "collected",
        heading: "What we collect",
        body: [
          "When you order we collect your name, WhatsApp number, delivery address, your stated car (make, model, year and row layout), and your chosen delivery zone.",
          "We also keep a note of the products in your order so we can fulfil and support it.",
        ],
      },
      {
        id: "storage",
        heading: "What stays in your browser",
        body: [
          "Your cart is stored in your own browser under the key \"luxeride-cart\", and the orders you place are stored under \"luxeride-orders\". These never leave your device except as the WhatsApp message you send us.",
          "If you clear your browser storage, those copies are gone — the WhatsApp message remains the record that counts.",
        ],
      },
      {
        id: "advertising",
        heading: "Advertising and analytics tags",
        body: [
          "When you arrive from an ad we read the campaign parameters on the link (such as utm_* and fbclid/gclid) and the page you landed on, and we store them in your browser to know which ad brought you in.",
          "We run the Meta Pixel and Google Analytics. They collect the pages you view and the events you trigger, and the campaign parameters above.",
          "Your name, phone number and delivery address are NEVER sent to Meta or Google — not raw and not hashed. That is enforced by a check in our code, not just a promise.",
        ],
      },
      {
        id: "retention",
        heading: "How long we keep it",
        body: [
          "[[OWNER INPUT REQUIRED: state the retention window for order records and for the browser attribution record.]]",
        ],
      },
      {
        id: "rights",
        heading: "Your choices",
        body: [
          "You can ask us to correct or delete the details we hold, or to stop contacting you, by messaging us on WhatsApp. We will action it as quickly as we can.",
        ],
      },
      {
        id: "law",
        heading: "Governing law",
        body: [
          "[[OWNER INPUT REQUIRED: confirm the governing law and jurisdiction, and our position on NDPC data-controller registration (decision D-11).]]",
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Terms",
    summary: "The plain-language terms of ordering from us.",
    updatedAt: "2026-10-03",
    sections: [
      {
        id: "order",
        heading: "What an order is",
        body: [
          "Placing an order starts a conversation: it sends your details to us on WhatsApp. The order is confirmed when we reply to you there, before dispatch.",
        ],
      },
      {
        id: "price",
        heading: "Price",
        body: [
          "Prices are shown as a band because they depend on your car's brand tier and, for some products, on whether it has two rows or three. The exact price is confirmed on WhatsApp for your car before we cut anything.",
        ],
      },
      {
        id: "payment",
        heading: "Paying",
        body: [
          "You may pay on delivery, or prepay by bank transfer for a discount. When bank details are not yet published, only pay on delivery is offered.",
        ],
      },
      {
        id: "cancellation",
        heading: "Cancelling",
        body: [
          "[[OWNER INPUT REQUIRED: state what happens if a customer cancels after dispatch but before delivery, and whether any cost is passed on.]]",
        ],
      },
      {
        id: "warranty",
        heading: "Warranty",
        body: [
          "[[OWNER INPUT REQUIRED: state the warranty scope and the claim route, and confirm it defers to the fit guarantee rather than contradicting it.]]",
        ],
      },
    ],
  },
};

export const POLICY_SLUGS = Object.keys(POLICIES) as PolicySlug[];

export function getPolicy(slug: string): Policy | undefined {
  return (POLICIES as Record<string, Policy>)[slug];
}
