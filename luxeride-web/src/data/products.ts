export type Tier = "regular" | "premium";

/**
 * One sellable OPTION on a product. Added 2026-10-04 with `ProductVariation`.
 *
 * A variation carries its own price because that is the whole point of one: a gear
 * cover that fits a 5-speed stick is not the same object, and not the same price, as
 * the same cover for an automatic. `Product.regular`/`premium` remain what a product
 * with ONE option sells at; `variationBase()` is what one with several sells at once
 * a shopper has chosen.
 */
export interface ProductVariation {
  slug: string;
  name: string;
  regular: number;
  premium: number;
  rowApplicable: boolean;
  threeRowSurcharge: number | null;
  /** "in_stock" | "made_to_order" | "out_of_stock". */
  stockState: string;
  sku: string | null;
}

/**
 * ONE PART OF A BUNDLE, already resolved to the two numbers it contributes.
 *
 * Resolved rather than lazy because the price is the whole point: a bundle is worth the
 * sum of its parts less a discount, and a part whose price had to be fetched before it
 * could be added up is a part that cannot be summed.
 */
export interface ProductBundleItem {
  /** The part's product slug — the stable handle a cart line or an admin form uses. */
  productSlug: string;
  /** What the customer is told is inside. The variation's name when one is named. */
  name: string;
  qty: number;
  /** This part at a regular-tier car's brand price. */
  regular: number;
  /** This part at a premium-tier car's brand price. */
  premium: number;
}

/**
 * A product that is a SET of other products. Present only on a bundle; absent on
 * everything else, which is the overwhelming majority of the catalogue.
 *
 * WHY A BUNDLE IS A `Product` WITH THIS ATTACHED, RATHER THAN A NEW KIND OF THING
 *
 * It still needs a URL, a product page, a cart line and an order line, and all four are
 * `Product` references today. So the bundle IS a product, and this is the one fact a
 * product could not previously state: what it is made of.
 *
 * WHY THAT MATTERS, AND THE DEFECT IT REMOVES
 *
 * `full-bundle` used to be one hand-priced row — regular 110,000, premium 135,000 — with
 * "Double layer mats + seat covers" written in a prose `note`. A literal price cannot
 * follow the things it is made of, so moving the double layer mats from 68,000 to 75,000
 * left a bundle claiming to contain them and priced as though it did not. It also could
 * only ever BE that one composition: a customer wanting single layer mats with covers
 * had nothing to buy, and neither did one wanting mats with a boot liner.
 *
 * With the parts recorded, the price is derived from them by
 * `deriveBundlePrices()` in `src/lib/bundle-price.ts`, and a bundle can be whatever
 * composition the owner builds.
 */
export interface ProductBundle {
  discountKind: string;
  discountValue: number;
  /** When true, saving the bundle rewrites the product's two prices from these parts. */
  derivePricing: boolean;
  /** The parts' total with no discount — the "bought separately" figure. */
  listRegular: number;
  listPremium: number;
  items: ProductBundleItem[];
}

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

  /**
   * The options on this product. Added 2026-10-04.
   *
   * ALWAYS present, and always at least one long, on a database-backed product:
   * `createProduct` in the admin creates the first variation alongside the product,
   * because a product with no variation has nothing the shop can price or sell.
   */
  variations?: ProductVariation[];

  /**
   * Present only when this product is a SET of other products.
   *
   * The seed data in this file cannot express a composition — it is a flat array of
   * products, which is the shape that produced a bundle with exactly one possible
   * composition — so `variations`-style seed data is not provided here and the bundle
   * definition lives in the database, where the owner can edit it in `/admin`.
   */
  bundle?: ProductBundle;

  // ── SALE PRICING, resolved per product at render time ─────────────────────
  //
  // The three below are set by `withSalePricing()` in `src/lib/catalogue.ts` and are
  // ABSENT on a product no promotion applies to. They are deliberately not database
  // columns: a sale price is the list price MINUS whatever promotion is live right
  // now, and storing it would be a second number that could disagree with the first.
  //
  // The discount itself is always computed by `resolveDiscount` against the price
  // shown — never in the browser. These are for DISPLAY; the order is priced again
  // from the database when it is written.
  //
  /** What the customer pays, when a promotion applies. Absent otherwise. */
  salePrice?: number;
  /** The price being struck through. Absent when there is no sale. */
  listPrice?: number;
  /** What the promotion was called — "Black Friday". Absent when there is no sale. */
  saleLabel?: string;
  /** The card badge, e.g. "20% OFF". Absent when there is no sale. */
  saleBadge?: string;

  // ── PDP copy. Added by storefront-catalog §7.1; rendered by §7.3/§10.6. ─────
  // Every value below is either a restatement of a claim the site already makes
  // elsewhere, or a description of the process rather than of a property.
  // Nothing here asserts a material grade, a thickness, a warranty or a lead
  // time that is not already on record in this repository — see §7.2.
  /** What the set is made of. */
  materials?: string;
  /** What the customer receives, as a list. */
  inBox?: string[];
  /** What the product covers on the car. */
  coverage?: string;
  /** How it goes on. */
  install?: string;
  /** How it is cleaned. */
  care?: string;
  /** Only questions whose answer is on record. Empty is the honest default. */
  faq?: { q: string; a: string }[];
  /**
   * The availability sentence for this product. Deliberately identical across
   * the catalogue: no code path establishes stock for a specific car, so no
   * product may claim one. `AVAILABILITY_COPY` in `src/lib/availability.ts` is
   * the same claim in its catalogue-level form.
   */
  availability: string;
  /**
   * Authored meta description, 120–160 characters (storefront-catalog §10.8).
   *
   * Authored rather than composed, because composing one from `note` +
   * `materials` + `availability` was measured across all seven products and
   * lands between 122 and 176 characters — three over the ceiling — while
   * dropping the availability sentence lands between 74 and 128, most under the
   * floor. `scripts/seo-check.mjs` asserts the band mechanically, so an edit
   * that breaks it fails the build instead of shipping.
   *
   * Every sentence here is a claim that is on record elsewhere in this file or
   * in `src/data/locations.ts`. None asserts stock, a lead time, a material
   * grade or a fitment for a car the fitment table does not cover.
   */
  seoDescription?: string;
}

export interface Category {
  slug: string;
  name: string;
  blurb: string;
  /** ≤60 characters, asserted by `scripts/seo-check.mjs`. */
  seoTitle?: string;
  /** 120–160 characters, asserted by `scripts/seo-check.mjs`. */
  seoDescription?: string;
  /** The one line under the category heading. */
  heroLine?: string;
}

export const CATEGORIES: Category[] = [
  {
    slug: "floor-mats",
    name: "Floor Mats",
    blurb: "Laser-measured TPE mats for your exact model",
    seoTitle: "Custom-Fit Car Floor Mats",
    seoDescription:
      "Laser-measured TPE floor mats cut to your exact car, single or double layer, covering every footwell in the rows you choose. Drop-in, no tools.",
    heroLine: "Laser-measured to your exact car. Drop-in, no tools, no drilling.",
  },
  {
    slug: "seat-covers",
    name: "Seat Covers",
    blurb: "Full-set custom seat covers",
    seoTitle: "Custom-Fit Car Seat Covers",
    seoDescription:
      "Full-set custom seat covers made for your exact car, fitted over the existing seats. We confirm your row layout with you on WhatsApp before dispatch.",
    heroLine: "Full-set covers, made for your seats and confirmed before we cut.",
  },
  {
    slug: "bundles",
    name: "Bundles",
    blurb: "Mats + seat covers, priced together",
    seoTitle: "Mats and Seat Covers Bundles",
    seoDescription:
      "Double layer mats and full-set seat covers together, priced below buying the two separately. One order, one delivery, made for your exact car.",
    heroLine: "The mats and the covers together, priced below buying them separately.",
  },
  {
    slug: "cargo-liners",
    name: "Cargo Liners",
    blurb: "Trunk/boot protection",
    seoTitle: "Custom-Fit Cargo and Boot Liners",
    seoDescription:
      "A laser-measured boot liner made for your exact car, laying flat on the boot floor to take the knocks that luggage, shopping and loads bring.",
    heroLine: "Laser-measured to your boot floor, so it lies flat and stays put.",
  },
  {
    slug: "exterior",
    name: "Exterior",
    blurb: "Mud flaps & sun shades",
    seoTitle: "Mud Flaps and Sun Shades",
    seoDescription:
      "Mud flaps fitted at your car's existing mounting points with no drilling, and folding sun shades for the front and rear windscreens. Made to order.",
    heroLine: "Fitted at your car's existing mounting points. No drilling.",
  },
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
    slug: "floor-mats",
    name: "Floor Mats",
    categorySlug: "floor-mats",
    rowApplicable: true,
    // THE CHEAPER OPTION'S FIGURES, and that is deliberate rather than lazy.
    //
    // `Product.regular`/`premium` are what a quote reads when NO OPTION HAS BEEN
    // CHOSEN — the floor for the fallback, never the headline. The customer-facing band
    // on the product page is computed across the options by `priceRange()`, so this page
    // reads ₦45,000 – ₦82,000 rather than one layer's price pretending to be the price
    // of the mats. Each option carries its own figures below, and the fit check prices
    // from the floor pan's per-year price for the option the customer picked.
    regular: 45000,
    premium: 58000,
    threeRowSurcharge: 10000,
    note: "Single or double layer, cut to your car",
    images: [], // resolved from public/products/manifest.json — see src/lib/media-manifest.ts
    /**
     * THE TWO LAYERS, AS OPTIONS OF THIS PRODUCT.
     *
     * They were two PRODUCTS until 2026-10-05 — `single-layer-mats` and
     * `double-layer-mats`, two URLs, two cards, two sitemap entries, and a Fit Finder
     * that had to pretend choosing a layer meant choosing a product. They are types of
     * the same mat: same measurement, same cut, same fit claim, differing by a
     * waterproof base layer underneath.
     *
     * Merging them is what makes the per-range model work: one floor pan offers ONE
     * product in two layers, and each year range can be cut for one layer or both —
     * `LayoutVariant` already says which pan offers which layer, and `RangePrice` says
     * what that layer costs for those years.
     *
     * The prices are the ones the two products carried, unchanged.
     */
    variations: [
      {
        slug: "single-layer",
        name: "Single Layer",
        regular: 45000,
        premium: 58000,
        rowApplicable: true,
        threeRowSurcharge: 10000,
        stockState: "made_to_order",
        sku: null,
      },
      {
        slug: "double-layer",
        name: "Double Layer",
        regular: 68000,
        premium: 82000,
        rowApplicable: true,
        threeRowSurcharge: 12000,
        stockState: "made_to_order",
        sku: null,
      },
    ],
    materials: "Laser-measured TPE. Single layer is the top mat; double layer adds a waterproof base layer under it.",
    inBox: [
      "Single layer: a mat for every footwell in the rows you selected",
      "Double layer: a top mat and a waterproof base layer for every one of them",
    ],
    coverage: "Every footwell in the rows you selected.",
    install: "Drop-in. Both layers lay over the existing carpet — no tools and no drilling.",
    care: "Single layer: shake out and wipe. Double layer: lift the top mat out and wipe both layers.",
    faq: [
      {
        q: "What is the difference between the layers?",
        a: "Single layer is the top mat on its own. Double layer adds a waterproof base layer underneath it, which is what you want if spills are a worry. Both cover exactly the same footwells.",
      },
      {
        q: "Why is the price a range?",
        a: "Because it depends on your car. A premium-brand car is priced above a regular-brand one, a three-row car needs an extra mat set, and the double layer costs more than the single one.",
      },
    ],
    availability: "Made to order for your exact car.",
    seoDescription:
      "Laser-measured TPE floor mats cut to your exact car, in single or double layer. Every footwell covered, drop-in, priced per car.",
  },
  {
    slug: "seat-covers",
    name: "Seat Covers",
    categorySlug: "seat-covers",
    rowApplicable: true,
    // ₦100,000, and THE SAME AT BOTH TIERS — owner's figure, 2026-10-05.
    //
    // It was 52,000/65,000 before, which was a guess from the prototype. The price is
    // now the number the owner actually charges, and there is no premium uplift
    // because there is no cheaper version of this product: the colourways are options,
    // not tiers. `priceRange()` renders a single figure when `regular === premium`, so
    // the card and the PDP show one price rather than a band nobody can get.
    regular: 100000,
    premium: 100000,
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
    seoDescription:
      "Full-set custom seat covers made for your exact car, fitted over the existing seats. We confirm your row layout with you before dispatch.",
    /**
     * The colourways the owner photographed, 2026-10-05.
     *
     * NAMED NEUTRALLY, DELIBERATELY. Seventeen photographs of one set in several colours
     * were dropped in, and the agent cannot read images — so the colour in each frame is
     * unknown, and `Seat Covers — Beige` on a black frame is a caption nobody
     * verified. The numbering is true (there are seventeen, in the order they arrived)
     * and the names are editable in `/admin/products/[id]`, which is what the
     * variation editor exists for.
     *
     * The database rows are the authority; this is the seed value they are created from
     * and is overwritten by `prisma/seed.mts`.
     */
    variations: undefined,
  },
  {
    // The second cover, added 2026-10-05 at the owner's request: a DIFFERENT product
    // that REUSES the seat-cover photographs.
    //
    // The reuse is one manifest entry, not a copy: `public/products/manifest.json` is
    // keyed by slug, so this key points at the same seventeen files `seat-covers` does.
    // No duplicated upload, no second folder, and swapping one set of photographs for
    // this product is editing one key.
    slug: "seat-covers-3d",
    name: "Seat Covers \u2014 3D Quilted",
    categorySlug: "seat-covers",
    rowApplicable: true,
    regular: 100000,
    premium: 100000,
    threeRowSurcharge: 16000,
    note: "Quilted 3D pattern",
    images: [],
    materials: "Custom-cut covers made for your car's seats.",
    inBox: ["A cover for every seat in the rows you selected"],
    coverage: "Every seat in the rows you selected.",
    install: "Fitted over the existing seats. We confirm the row layout with you on WhatsApp before dispatch.",
    care: "Wipe clean with a damp cloth.",
    faq: [],
    availability: "Made to order. Fits any car with the same seats.",
    seoDescription:
      "Full-set quilted 3D custom seat covers made for your exact car, fitted over the existing seats and confirmed before dispatch.",
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
    seoDescription:
      "Double layer mats and full-set seat covers together, priced below buying the two separately. Made to order for your exact car and row layout.",
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
    seoDescription:
      "A laser-measured boot liner made for your exact car, laying flat on the boot floor to take the knocks that luggage and loads bring.",
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
    seoDescription:
      "A set of four mud flaps, two front and two rear, fitted at the existing mounting points of your car. No drilling into the bodywork.",
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
    seoDescription:
      "Folding sun shades for the front and rear windscreens, keeping the sun and its UV off your dashboard and seats on a parked car in Nigeria.",
  },
];

/**
 * THE BUNDLES, AND WHAT IS IN THEM.
 *
 * A composition cannot live on the `Product` entries above, and that is the point
 * rather than a limitation of the shape: `PRODUCTS` is a flat array of single things,
 * which is exactly the shape that produced a bundle with one possible composition.
 * `full-bundle` was a product row with a hand-typed price and its contents written in a
 * prose `note`, so there was nowhere at all to say "this one is made of those two" — and
 * nowhere for the price to come from.
 *
 * So the bundle definitions are their own list, and each one says which products it is
 * made of and by how much the total is discounted. `prisma/seed.mts` writes them, and
 * `/admin/products/[id]` edits them from there on; this is the seed value they are
 * created from.
 *
 * `variationSlug` names a SPECIFIC option when the bundle is that option rather than
 * "whatever it has" — a bundle of the beaded-edge mats must sum the beaded-edge price,
 * not the product's list price, or it is priced from a number nobody sells.
 */
export interface BundleSeed {
  /** The slug of the product that IS this bundle. It still is a product. */
  slug: string;
  discountKind: "percent" | "fixed";
  discountValue: number;
  items: { productSlug: string; variationSlug?: string; qty: number }[];
}

export const BUNDLES: BundleSeed[] = [
  {
    /*
     * THE FULL BUNDLE, AS A COMPOSITION RATHER THAN A LITERAL.
     *
     * It was regular 110,000 / premium 135,000, and the parts came to 168,000 / 182,000,
     * so the old figures were roughly a 34% discount and were not related to anything —
     * they were two numbers typed once. At 10% this bundle is 151,200 / 163,800, and it
     * MOVES: raise the double layer mats and this price follows, because it is worked
     * out from the parts on every seed and on every save.
     *
     * Ten rather than "whatever looks right" because the parts' own figures are the ones
     * that move, and a discount expressed as a percentage survives them.
     */
    slug: "full-bundle",
    discountKind: "percent",
    discountValue: 10,
    items: [
      // NAMES THE OPTION rather than the product, and that is what the bundle has
      // always meant: "double layer mats with covers", not "mats, whichever layer".
      // Leaving the option off would make the bundle the cheaper single-layer one the
      // moment someone changed the order of the parts.
      { productSlug: "floor-mats", variationSlug: "double-layer", qty: 1 },
      { productSlug: "seat-covers", qty: 1 },
    ],
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
/**
 * THE PRICE BAND, taken across the options when the product has any.
 *
 * A product with options has more than one price, and the band is what says so: Floor
 * Mats is ₦45,000 single and ₦82,000 double, so the card and the product page show
 * ₦45,000 – ₦82,000. Reading only `Product.regular` would print the cheapest layer as
 * though it were the price of the mats, which is the number a customer would then be
 * quoted before they chose a layer.
 *
 * A product with one option (or none) resolves to its own two figures, which is what
 * every other product in the catalogue does, so nothing about them changes.
 */
export function priceRange(p: Product): [number, number] {
  const options = p.variations ?? [];
  if (options.length === 0) {
    const lo = p.regular;
    const hi = p.rowApplicable ? p.premium + (p.threeRowSurcharge ?? 0) : p.premium;
    return [lo, hi];
  }

  const lows = options.map((option) => option.regular);
  const highs = options.map((option) =>
    option.rowApplicable
      ? option.premium + (option.threeRowSurcharge ?? 0)
      : option.premium,
  );
  return [Math.min(...lows), Math.max(...highs)];
}
