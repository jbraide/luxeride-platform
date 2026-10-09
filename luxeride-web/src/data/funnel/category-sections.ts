import type { Section } from "./sections.ts";

/**
 * The mechanism and comparison a CATEGORY page shows above its product grid
 * (`funnel-pages` 8.1).
 *
 * KEYED BY CATEGORY SLUG, because the mechanism is material-specific: the
 * carpet-versus-rubber-versus-TPE comparison is about floor mats and would be untrue
 * printed above seat covers. A category with no entry renders nothing at all, which
 * is the honest empty state rather than a generic block that says nothing
 * (Requirement 9.3).
 *
 * This is a TEASER, not the education page. The long form — the mechanism paragraph
 * by paragraph, the cost cards and the FAQ — lives at `/why-carpet-fails`, and
 * duplicating it here would put two versions of the same document in the index
 * (Requirement 1.4). The wording below is deliberately its own.
 *
 * No prices, and no digit: the section is about material and process only
 * (Requirement 4.1).
 */
export const CATEGORY_FUNNEL_SECTIONS: Record<string, Section[]> = {
  "floor-mats": [
    {
      kind: "heading",
      level: 2,
      eyebrow: "Before you buy",
      title: "Why the mat matters as much as the fit",
      body: "A mat that covers the footwell but holds water in its backing is still a wet footwell. Here is the short version — the full mechanism has its own page.",
    },
    {
      kind: "mechanism",
      items: [
        {
          title: "It has to cover the footwell",
          body: "A universal mat covers approximately. An edge that does not sit down is where water reaches the carpet underneath.",
          icon: "📐",
        },
        {
          title: "It must not hold water",
          body: "Fabric backing wicks a spill down and keeps it there. TPE is waterproof and has nothing for the water to soak into.",
          icon: "💧",
        },
        {
          title: "It has to be cut for your car",
          body: "Measured to your exact model and year, so the mat lies in the footwell rather than near it.",
          icon: "🚗",
        },
      ],
    },
    {
      kind: "comparison",
      columns: ["Carpet mat", "Universal rubber mat", "LuxeRide TPE mat"],
      rows: [
        {
          label: "Shaped for",
          cells: [
            "The car it came in, in cut pile",
            "A generic fit that suits many cars",
            "Your exact model and year",
          ],
        },
        {
          label: "Water",
          cells: [
            "Wicks into the pile and backing",
            "Sits on top; a curled edge lets water past",
            "Waterproof, with no fabric backing",
          ],
        },
        {
          label: "The layer on the floor",
          cells: [
            "Fabric that stays damp",
            "Rubber with an open edge",
            "A waterproof base layer above the carpet",
          ],
        },
      ],
    },
  ],
};
