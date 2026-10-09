import type { FunnelPage } from "./sections.ts";

/**
 * `/why-carpet-fails` — the education page's copy.
 *
 * AD COPY DOES NOT GO HERE, and neither does evidence the business does not have.
 * The page explains a MECHANISM — how a carpet mat takes water into its backing and
 * holds it against the floor pan — because the mechanism is true of the material,
 * and it does not rest on a statistic nobody measured (Requirement 7.1).
 *
 * NO PRICE appears anywhere in this file, and no digit at all. Prices are read from
 * the catalogue at render time (Requirement 4.1), so the comparison and cost
 * sections make claims about MATERIAL and PROCESS rather than about money — and
 * `scripts/funnel-content.test.mjs` fails if a figure or a scarcity token ever
 * creeps back in.
 */
export const whyCarpetFails: FunnelPage = {
  slug: "why-carpet-fails",
  metadata: {
    title: "Why Carpet Mats Fail — and What Actually Stops It",
    description:
      "A carpet floor mat takes water into its pile and backing and holds it against the floor pan. Here is the mechanism, an honest comparison, and what a fitted TPE mat does instead.",
    path: "/why-carpet-fails",
  },
  sections: [
    {
      kind: "heading",
      level: 1,
      eyebrow: "The problem",
      title: "Why carpet mats fail",
      body: "Your car left the factory with a carpet mat in the footwell. It looks fine and it feels fine. The trouble is what it is made of, and where it sits.",
    },
    {
      kind: "prose",
      heading: "The water has somewhere to go, and that is the problem",
      paragraphs: [
        "A carpet mat is not one surface. It is a cut pile of fibres over a backing layer, and the two behave very differently. A spill, a wet shoe or a rainy-season boot does not pool on the top — the fibre wicks it down, away from your eye and into the mat.",
        "That is exactly what makes it feel dry a minute later. The water has not gone. It has moved to the one layer you cannot see, and the one that cannot dry.",
        "In the footwell the mat lies flat on the floor pan, so the underside has no air moving across it. A mat that dries on top and stays wet underneath holds that damp against the floor pan far longer than it would if it could drain.",
        "Over days rather than minutes, that is where a smell comes from and where the trim stays wet. Nothing about this needs a statistic to be true — it is what a fabric backing does when it is not allowed to dry.",
      ],
    },
    {
      kind: "heading",
      level: 2,
      title: "The mechanism, step by step",
    },
    {
      kind: "mechanism",
      items: [
        {
          title: "The pile takes the water",
          body: "Cut fibres wick moisture down and away from the surface, so the mat looks and feels dry almost immediately.",
          icon: "💧",
        },
        {
          title: "The backing holds it",
          body: "Under the pile is a backing layer. Once water reaches it there is nowhere for it to go and no air to carry it away.",
          icon: "🧽",
        },
        {
          title: "The footwell closes over it",
          body: "A mat lies flat on the floor pan, so the damp underside is held against the metal and the trim with no airflow across it.",
          icon: "🚗",
        },
        {
          title: "Time finishes the job",
          body: "Damp fibre left in place is what a smell grows from, and what keeps the floor pan wet long after the top looks dry.",
          icon: "⏳",
        },
      ],
    },
    {
      kind: "heading",
      level: 2,
      title: "An honest comparison",
      body: "Three materials, described by what they are and how they are shaped. No brand is named, because the point is the material rather than a rival.",
    },
    {
      kind: "comparison",
      columns: ["Carpet mat", "Universal rubber mat", "LuxeRide TPE mat"],
      rows: [
        {
          label: "How it is made",
          cells: [
            "Cut pile over a fabric backing",
            "One moulded sheet, not shaped to a specific car",
            "Laser-measured and cut for your exact model and year",
          ],
        },
        {
          label: "What happens to water",
          cells: [
            "Wicks into the pile and holds in the backing",
            "Sits on top, but an edge that curls lets water past",
            "Waterproof TPE with no fabric backing to hold water",
          ],
        },
        {
          label: "How it covers the footwell",
          cells: [
            "Lies over the carpet; the edge moves with the foot",
            "Approximate shape, so coverage depends on the fit",
            "Cut to the footwell shape and laid in as one piece",
          ],
        },
        {
          label: "Cleaning",
          cells: [
            "Vacuum and shampoo the pile",
            "Rinse; grit can work underneath the edges",
            "Lift out and wipe both layers",
          ],
        },
        {
          label: "The layer against the floor",
          cells: [
            "Fabric backing that holds damp",
            "Rubber, with an open edge water can pass",
            "A waterproof base layer above the carpet",
          ],
        },
      ],
    },
    {
      kind: "heading",
      level: 2,
      title: "What a failed mat costs you",
      body: "Not a naira figure — we have not measured one, so we do not quote one. What it costs is the things a mat is supposed to protect.",
    },
    {
      kind: "cost",
      items: [
        {
          label: "Cabin air",
          value: "Worse over time",
          note: "Damp fibre held in a closed footwell is what a smell grows from.",
        },
        {
          label: "The footwell",
          value: "Stays wet",
          note: "A mat that cannot dry underneath keeps the trim and the floor pan damp for longer.",
        },
        {
          label: "The resale comparison",
          value: "Not published",
          note: "The usual pitch here quotes a five- or six-figure loss. We have not measured one, so we do not state one.",
        },
      ],
      footnote:
        "We publish a figure only when it is one we can point at. We cannot point at a resale-loss number, so this page does not carry one.",
    },
    {
      kind: "heading",
      level: 2,
      title: "What a fitted TPE mat does instead",
    },
    {
      kind: "steps",
      steps: [
        {
          title: "We cut it for your car",
          body: "The mat is laser-measured to your model and year, so it covers the footwell rather than sitting approximately in it.",
        },
        {
          title: "You choose the layer",
          body: "Single layer is the top mat on its own. Double layer adds a waterproof base underneath it, for the spills you would rather not think about.",
        },
        {
          title: "We confirm the fit",
          body: "We confirm your exact model and year on WhatsApp before dispatch, so nothing is cut on a guess.",
        },
        {
          title: "You pay when it arrives",
          body: "Pay the rider on delivery, nationwide — or prepay by bank transfer and take the saving off the order.",
        },
      ],
    },
    {
      kind: "risk",
      items: [
        "Measured to your exact model and year, not trimmed from a universal set.",
        "Made to order — nothing is pulled off a shelf and hoped to fit.",
        "We confirm the fit on WhatsApp before we cut.",
      ],
    },
    {
      kind: "faq",
      items: [
        {
          q: "Will a carpet mat not just dry on its own?",
          a: "It can, given air and time. The footwell is the problem: the mat lies flat on the floor pan, so the one layer that took the water is also the one with no air moving over it.",
        },
        {
          q: "Are universal rubber mats not good enough?",
          a: "They stop some water, but they are not shaped to your footwell. An edge that does not sit down is an edge water can pass, and water that reaches the carpet underneath does not come back out on its own.",
        },
        {
          q: "What makes TPE different?",
          a: "It is waterproof and it has no fabric backing to hold water. That is the whole difference that matters here — the water has nowhere to soak in and nothing to stay in.",
        },
        {
          q: "How do I know it will fit my car?",
          a: "We confirm your exact model and year on WhatsApp before we cut, and the mat is made to that fit rather than to a generic shape.",
        },
      ],
    },
    {
      kind: "cta",
      primary: { label: "Shop the floor mats", href: "/shop/floor-mats" },
      secondary: { label: "Find your exact fit", href: "/fit-finder" },
    },
  ],
};
