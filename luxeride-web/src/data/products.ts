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
    images: ["/products/seat-covers.jpg", "/products/seat-covers-detail.jpg", "/products/seat-covers-fit.jpg"],
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
    images: ["/products/bundle.jpg", "/products/bundle-detail.jpg", "/products/bundle-fit.jpg"],
  },
  {
    slug: "cargo-liner",
    name: "Cargo Liner",
    categorySlug: "cargo-liners",
    rowApplicable: false,
    regular: 35000,
    premium: 45000,
    note: "Trunk/boot protection, laser-measured",
    images: ["/products/cargo-liner.jpg", "/products/cargo-liner-detail.jpg", "/products/cargo-liner-fit.jpg"],
  },
  {
    slug: "mud-flaps",
    name: "Mud Flaps (Set of 4)",
    categorySlug: "exterior",
    rowApplicable: false,
    regular: 18000,
    premium: 24000,
    note: "Splash guards, front & rear, no drilling",
    images: ["/products/mud-flaps.jpg", "/products/mud-flaps-detail.jpg", "/products/mud-flaps-fit.jpg"],
  },
  {
    slug: "sun-shade",
    name: "Sun Shade Set",
    categorySlug: "exterior",
    rowApplicable: false,
    regular: 15000,
    premium: 20000,
    note: "Front & rear windscreen UV shades",
    images: ["/products/sun-shade.jpg", "/products/sun-shade-detail.jpg", "/products/sun-shade-fit.jpg"],
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
