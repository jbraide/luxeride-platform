import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import { BuyBox } from "@/components/BuyBox";
import JsonLd from "@/components/JsonLd";
import ProductGallery from "@/components/ProductGallery";
import RelatedProducts from "@/components/RelatedProducts";
import { StickyBuyBar } from "@/components/StickyBuyBar";
import ViewItemTracker from "@/components/ViewItemTracker";
import renderSection from "@/components/funnel/render-section";
import { getCategory, getProductWithSale, listProducts } from "@/lib/catalogue";
import { listDeliveryZones } from "@/lib/delivery";
import { priceRange } from "@/data/products";
import type { Section } from "@/data/funnel/sections";
import { resolveMedia } from "@/lib/media-manifest";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, productJsonLd } from "@/lib/seo";
import { selectedVariationSlug } from "@/lib/select-variation";

/**
 * The PDP is DYNAMIC, and it used to be static — that is the whole change.
 *
 * Until 2026-10-04 the catalogue was a compile-time constant, so the seven pages were
 * generated at build time behind `dynamicParams = false` (§14.3), which made an
 * unlisted slug a 404 at the routing layer rather than a render that discovers there
 * is nothing there and calls `notFound()`.
 *
 * Both of those are gone, and both had to go:
 *
 *   - `generateStaticParams` CANNOT run against a database catalogue. A product
 *     created in `/admin/products` does not exist at build time, so its PDP would
 *     never be generated and the link from `/shop` would 404 — the admin change
 *     would appear on the shop index and lead nowhere.
 *   - `dynamicParams = false` is the flip side of the same coin: with no build-time
 *     list, "not in the generated set" would 404 every real product.
 *
 * `notFound()` in the body is what handles an unknown slug now, and it does so
 * against a real row lookup — which is a genuine answer rather than a build-time
 * list that can disagree with the database.
 */
export const dynamic = "force-dynamic";

/**
 * `storefront-catalog` §10.8 — complete.
 *
 * Before this, all seven product pages emitted the identical root title, so
 * seven distinct products competed for one query as one page.
 *
 * The description is **authored per product** (`seoDescription` in
 * `src/data/products.ts`), not composed. Composing one from `note` +
 * `materials` + `availability` was measured across all seven and lands between
 * 122 and 176 characters — three of the seven over §10.8's 160 ceiling — while
 * dropping the availability sentence lands between 74 and 128, most under its
 * floor. `scripts/seo-check.mjs` now holds the band mechanically.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductWithSale(slug);
  if (!product) return {};

  const category = await getCategory(product.categorySlug);
  // "Seat Covers — Seat Covers" helps nobody, so the suffix is dropped when the
  // product and its category are the same words.
  const suffix = category && category.name !== product.name ? ` — ${category.name}` : "";

  return pageMetadata({
    title: `${product.name}${suffix}`,
    description: product.seoDescription,
    path: `/products/${product.slug}`,
    image: `/products/${product.slug}/opengraph-image`,
  });
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variation?: string | string[] }>;
}) {
  const { slug } = await params;
  const product = await getProductWithSale(slug);
  if (!product) notFound();

  /*
   * WHICH OPTION THE VISITOR PICKED, IF ANY.
   *
   * Since 2026-10-05 a product can carry options, and Floor Mats carries two layers at
   * two prices. `?variation=` is how that choice is expressed in a URL: it is what the
   * option links on this page set, and it is what the 307s from the old
   * `/products/single-layer-mats` and `/products/double-layer-mats` land on.
   *
   * It is resolved against the product's OWN options, so a hand-typed or stale slug
   * selects nothing rather than selecting a layer this product does not sell — which
   * would put a price on screen for something nobody can be sold.
   */
  const rawVariation = (await searchParams).variation;
  const selectedSlug = selectedVariationSlug(
    product,
    Array.isArray(rawVariation) ? rawVariation[0] : rawVariation,
  );

  // Two database reads in parallel: the related strip needs the whole catalogue and
  // the sibling category needs one row, and neither waits for the other.
  //
  // `resolveMedia` is FILESYSTEM-backed and synchronous, so it is not in the
  // `Promise.all` — wrapping it in `Promise.resolve` to fit it in would be a lie
  // about what is asynchronous.
  const [products, category, deliveryZones] = await Promise.all([
    listProducts(),
    getCategory(product.categorySlug),
    // The delivery line in the buy box states the same `Location` rows the checkout
    // charges from, so the two cannot quote different figures.
    listDeliveryZones(),
  ]);
  const media = resolveMedia(product.slug);
  const [priceMin, priceMax] = priceRange(product);

  /**
   * THE FIT-GUIDE AND MECHANISM, FROM THE PRODUCT'S OWN DATA (`funnel-pages` 8.2).
   *
   * Every line below is read from this product's own fields — `materials`,
   * `coverage`, `install`, `care` — so the page keeps ONE source of truth for what
   * the product is and how it fits, and introduces no second price or fit claim
   * anywhere (Requirement 8.2). If a product carries none of those fields the
   * mechanism section is simply absent, which is the honest empty state
   * (Requirement 9.3). These sections add no buy control; `BuyBox` and `StickyBuyBar`
   * remain the only two (Requirement 8.4).
   */
  const mechanismItems = [
    product.materials ? { title: "What it is made of", body: product.materials, icon: "🧵" } : null,
    product.coverage ? { title: "What it covers", body: product.coverage, icon: "🚗" } : null,
    product.install ? { title: "How it goes on", body: product.install, icon: "🔧" } : null,
    product.care ? { title: "How to clean it", body: product.care, icon: "🧼" } : null,
  ].filter((item): item is { title: string; body: string; icon: string } => item !== null);

  const optionNames = (product.variations ?? []).map((variation) => variation.name);

  const productFunnelSections: Section[] = [];
  if (mechanismItems.length > 0) {
    productFunnelSections.push({
      kind: "heading",
      level: 2,
      eyebrow: "How it fits",
      title: `${product.name}, made for your car`,
    });
    productFunnelSections.push({ kind: "mechanism", items: mechanismItems });
  }
  productFunnelSections.push({ kind: "heading", level: 2, title: "How ordering works" });
  productFunnelSections.push({
    kind: "steps",
    steps: [
      {
        title: "Tell us your car",
        body: "Open the Fit Finder and pick your model and year, so the fit and the price are confirmed against the exact car.",
      },
      {
        title: "Choose your option",
        body:
          optionNames.length > 1
            ? // NAMED when there are only a few, COUNTED when there are many. Seat Covers
              // has eighteen, and `join(", ")` printed all of them — a wall of colourways
              // in the middle of a paragraph, which reads as a rendering fault rather
              // than as instructions.
              optionNames.length <= 4
              ? `Pick from the options on this page — ${optionNames.join(", ")} — and the choice travels into the Fit Finder with you.`
              : `Pick the option you want from the ${optionNames.length} on this page, and the choice travels into the Fit Finder with you.`
            : "The option you pick on this page travels into the Fit Finder with you.",
      },
      {
        title: "We confirm the fit",
        body: "We confirm your exact model and year on WhatsApp before dispatch, so nothing is made on a guess.",
      },
      {
        title: "Pay when it arrives",
        body: "Pay the rider on delivery, nationwide — or prepay by bank transfer for the saving.",
      },
    ],
  });

  /**
   * One array, two consumers: the visible trail and the BreadcrumbList. A
   * structured-data trail that does not match the page a visitor sees is a
   * policy violation, so they are built from the same source rather than
   * written twice.
   *
   * The category crumb points at `/shop?category=<slug>` because that is where
   * the category actually lives today; storefront-catalog §6.5 promotes it to a
   * real path, and this line changes with it.
   */
  const trail = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    { name: category?.name ?? "Shop", path: `/shop?category=${product.categorySlug}` },
    { name: product.name, path: `/products/${product.slug}` },
  ];

  // §12.5: the real photography from the manifest, so the image crawler is
  // offered the product rather than the placeholder. Falls back to the product's
  // own og:image when the product has no photography yet.
  //
  // The manifest path is ALREADY site-relative and already starts with
  // `products/`, so it gets a bare leading slash. Prefixing `/products/` here
  // produced `/products/products/...`, which was caught by reading the rendered
  // JSON-LD rather than the source.
  const images = media && media.images.length > 0
    ? media.images.map((entry) => `/${entry.path}`)
    : [`/products/${product.slug}/opengraph-image`];

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <JsonLd
        data={productJsonLd({
          name: product.name,
          // `seoDescription` is optional from 2026-10-04 — a product created in the
          // admin has none. JSON-LD's `description` is a required field of the Product
          // schema though, so something real has to go in. The product's own
          // availability sentence is on record and about the right thing; inventing a
          // marketing line here would put a claim in a crawler-facing document that
          // nobody wrote.
          description:
            product.seoDescription ||
            // `||` and not `??` all the way down: `join()` on an empty list returns
            // `""`, which is falsy but never nullish, so a trailing `?? product.name`
            // could never fire and a product with no note AND no availability would
            // have been published to crawlers with `"description": ""`.
            [product.note, product.availability].filter(Boolean).join(" — ") ||
            product.name,
          image: images[0],
          slug: product.slug,
          category: category?.name ?? "Car accessories",
          url: `/products/${product.slug}`,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {/* `faq` is optional from 2026-10-04; `faqJsonLd` already returns null for an
          empty list, so an absent one is passed as an empty array rather than
          special-cased here. */}
      {faqJsonLd(product.faq ?? []) ? <JsonLd data={faqJsonLd(product.faq ?? [])!} /> : null}
      <ViewItemTracker
        productSlug={product.slug}
        productName={product.name}
        priceMin={priceMin}
        priceMax={priceMax}
      />

      <Breadcrumbs trail={trail} />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div>
          <ProductGallery media={media} name={product.name} />
        </div>

        {/* The whole buy column, extracted so the route is about routing and
            metadata (§10.2). The guarantee and the delivery band come from
            `TrustStrip`, so the PDP cannot restate a different figure. */}
        <BuyBox product={product} selectedSlug={selectedSlug} deliveryZones={deliveryZones} />
      </div>

      {/* The fit-guide and ordering process, read from this product's own data.
          Rendered here, between the buy column and the cross-sell, so a visitor who
          has decided reads HOW it fits before being shown other products. */}
      <div className="mt-10">
        {productFunnelSections.map((section, index) => (
          <Fragment key={index}>{renderSection(section)}</Fragment>
        ))}
      </div>

      <RelatedProducts product={product} products={products} />

      {/* Mobile-only, fixed to the viewport, so a visitor who has scrolled the
          gallery and the FAQ can still act. The spacer keeps the footer clear
          of the bar on a phone. */}
      <div aria-hidden className="h-20 md:hidden" />
      <StickyBuyBar product={product} selectedSlug={selectedSlug} />
    </div>
  );
}
