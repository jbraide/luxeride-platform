export type Tier = "regular" | "premium";

export interface Product {
  slug: string;
  name: string;
  categorySlug: string;
  rowApplicable: boolean;
  regular: number;
  premium: number;
  threeRowSurcharge?: number;
  note: string;
  images: string[]; // paths under /public

  // ── PDP copy. Added by storefront-catalog §7.1; rendered by §7.3/§10.6. ─────
  // Every value below is either a restatement of a claim the site already makes
  // elsewhere, or a description of the process rather than of a property.
  // Nothing here asserts a material grade, a thickness, a warranty or a lead
  // time that is not already on record in this repository — see §7.2.
  /** What the set is made of. */
  materials: string;
  /** What the customer receives, as a list. */
  inBox: string[];
  /** What the product covers on the car. */
  coverage: string;
  /** How it goes on. */
  install: string;
  /** How it is cleaned. */
  care: string;
  /** Only questions whose answer is on record. Empty is the honest default. */
  faq: { q: string; a: string }[];
  /**
   * The availability sentence for this product. Deliberately identical across
   * the catalogue: no code path establishes stock for a specific car, so no
   * product may claim one. `AVAILABILITY_COPY` in `src/lib/availability.ts` is
   * the same claim in its catalogue-level form.
   */
  availability: string;
}

export interface Category {
  slug: string;
  name: string;
  blurb: string;
}

export const CATEGORIES: Category[] = [
  { slug: "floor-mats", name: "Floor Mats", blurb: "Laser-measured TPE mats for your exact model" },
  { slug: "seat-covers", name: "Seat Covers", blurb: "Full-set custom seat covers" },
  { slug: "bundles", name: "Bundles", blurb: "Mats + seat covers, priced together" },
  { slug: "cargo-liners", name: "Cargo Liners", blurb: "Trunk/boot protection" },
  { slug: "exterior", name: "Exterior", blurb: "Mud flaps & sun shades" },
];

// Ported from CONFIG.PRODUCTS in the prototype, now with slugs + categories
// for real catalog browsing. Row-applicable products add a flat surcharge
// for 3-row cars (set on the Fit Finder's row-configuration step).
//
// `images[]` may only name files that exist in `public/`. Fifteen paths used to
// be listed here for seat covers, the bundle, the cargo liner, mud flaps and the
// sun shade, and not one of those files was ever produced — which is why five of
// the seven products rendered an empty grey box on their card and an empty strip
// on their PDP. `scripts/media.mjs --check` now fails the build on any such path.
//
// Products with no entry are rendered by `ProductPlaceholder`. Real photography
// arrives through `public/products/manifest.json` (storefront-catalog §9),
// which `ProductImage` prefers over this list.
export const PRODUCTS: Product[] = [
  {
    slug: "single-layer-mats",
    name: "Single Layer Mats",
    categorySlug: "floor-mats",
    rowApplicable: true,
    regular: 45000,
    premium: 58000,
    threeRowSurcharge: 10000,
    note: "Top layer only",
    images: ["/products/single-layer.svg", "/products/single-layer-texture.svg", "/products/single-layer-fit.svg"],
    materials: "Laser-measured TPE mats.",
    inBox: ["A mat for every footwell in the rows you selected"],
    coverage: "Every footwell in the rows you selected.",
    install: "Drop-in. Lays over the existing carpet — no tools and no drilling.",
    care: "Shake out and wipe clean with a damp cloth.",
    faq: [
      {
        q: "Why is the price a range?",
        a: "Because it depends on your car. A premium-brand car is priced above a regular-brand one, and a three-row car needs an extra mat set.",
      },
    ],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "double-layer-mats",
    name: "Double Layer Mats",
    categorySlug: "floor-mats",
    rowApplicable: true,
    regular: 68000,
    premium: 82000,
    threeRowSurcharge: 12000,
    note: "Top + waterproof base layer",
    images: ["/products/double-layer.svg", "/products/double-layer-texture.svg", "/products/double-layer-fit.svg"],
    materials: "Two layers: a top mat over a waterproof base layer.",
    inBox: ["A top layer and a waterproof base layer for every footwell in the rows you selected"],
    coverage: "Every footwell in the rows you selected.",
    install: "Drop-in. Both layers lay over the existing carpet — no tools and no drilling.",
    care: "Lift the top layer out and wipe both layers with a damp cloth.",
    faq: [
      {
        q: "What is the difference from the Single Layer Mats?",
        a: "The Single Layer Mats are the top layer only. This set adds the waterproof base layer underneath it.",
      },
    ],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "seat-covers",
    name: "Seat Covers",
    categorySlug: "seat-covers",
    rowApplicable: true,
    regular: 52000,
    premium: 65000,
    threeRowSurcharge: 16000,
    note: "Full-set custom seat covers",
    images: [], // no photography yet — renders ProductPlaceholder
    materials: "Custom-cut covers made for your car's seats.",
    inBox: ["A cover for every seat in the rows you selected"],
    coverage: "Every seat in the rows you selected.",
    install: "Fitted over the existing seats. We confirm the row layout with you on WhatsApp before dispatch.",
    care: "Wipe clean with a damp cloth.",
    faq: [],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "full-bundle",
    name: "Full Bundle",
    categorySlug: "bundles",
    rowApplicable: true,
    regular: 110000,
    premium: 135000,
    threeRowSurcharge: 25000,
    note: "Double layer mats + seat covers",
    images: [], // no photography yet — renders ProductPlaceholder
    materials: "The Double Layer Mats and the Seat Covers, supplied together.",
    inBox: ["The Double Layer Mats set", "The Seat Covers set"],
    coverage: "Every footwell and every seat in the rows you selected.",
    install: "Same as each set on its own — drop-in mats and covers that fit over the existing seats.",
    care: "Wipe clean with a damp cloth.",
    faq: [
      {
        q: "Is this cheaper than buying the two sets separately?",
        a: "Yes. The bundle is priced below the Double Layer Mats and the Seat Covers added together, at both the regular and premium tier.",
      },
    ],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "cargo-liner",
    name: "Cargo Liner",
    categorySlug: "cargo-liners",
    rowApplicable: false,
    regular: 35000,
    premium: 45000,
    note: "Trunk/boot protection, laser-measured",
    images: [], // no photography yet — renders ProductPlaceholder
    materials: "Laser-measured boot liner.",
    inBox: ["One boot liner"],
    coverage: "The boot floor.",
    install: "Drop-in. Lays on the boot floor — no tools and no drilling.",
    care: "Shake out and wipe clean with a damp cloth.",
    faq: [],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "mud-flaps",
    name: "Mud Flaps (Set of 4)",
    categorySlug: "exterior",
    rowApplicable: false,
    regular: 18000,
    premium: 24000,
    note: "Splash guards, front & rear, no drilling",
    images: [], // no photography yet — renders ProductPlaceholder
    materials: "Splash guards for the front and rear wheel arches.",
    inBox: ["Four guards — two front, two rear"],
    coverage: "The front and rear wheel arches.",
    install: "Fitted at the existing mounting points. No drilling.",
    care: "Rinse with water.",
    faq: [],
    availability: "Made to order for your exact car.",
  },
  {
    slug: "sun-shade",
    name: "Sun Shade Set",
    categorySlug: "exterior",
    rowApplicable: false,
    regular: 15000,
    premium: 20000,
    note: "Front & rear windscreen UV shades",
    images: [], // no photography yet — renders ProductPlaceholder
    materials: "Folding shades for the front and rear windscreens.",
    inBox: ["One front shade and one rear shade"],
    coverage: "The front and rear windscreens.",
    install: "Unfolds against the inside of the glass.",
    care: "Wipe clean with a damp cloth.",
    faq: [],
    availability: "Made to order for your exact car.",
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function priceRange(p: Product): [number, number] {
  const lo = p.regular;
  const hi = p.rowApplicable ? p.premium + (p.threeRowSurcharge ?? 0) : p.premium;
  return [lo, hi];
}
