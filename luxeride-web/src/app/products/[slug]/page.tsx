import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import { BuyBox } from "@/components/BuyBox";
import JsonLd from "@/components/JsonLd";
import ProductGallery from "@/components/ProductGallery";
import RelatedProducts from "@/components/RelatedProducts";
import { StickyBuyBar } from "@/components/StickyBuyBar";
import ViewItemTracker from "@/components/ViewItemTracker";
import { PRODUCTS, getCategoryBySlug, getProductBySlug, priceRange } from "@/data/products";
import { resolveMedia } from "@/lib/media-manifest";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, productJsonLd } from "@/lib/seo";

/**
 * The catalogue is a compile-time constant, so the seven pages are generated at
 * build time and nothing else may be rendered on demand (storefront-catalog
 * §14.3). Without this, `/products/<anything>` renders a page that then calls
 * `notFound()` — a 404 that arrives as a 200-worthy render instead of a real
 * 404 at the routing layer.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

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
  const product = getProductBySlug(slug);
  if (!product) return {};

  const category = getCategoryBySlug(product.categorySlug);
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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const [priceMin, priceMax] = priceRange(product);
  const media = resolveMedia(product.slug);
  const category = getCategoryBySlug(product.categorySlug);

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
          description: product.seoDescription,
          image: images[0],
          slug: product.slug,
          category: category?.name ?? "Car accessories",
          url: `/products/${product.slug}`,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(trail)} />
      {faqJsonLd(product.faq) ? <JsonLd data={faqJsonLd(product.faq)!} /> : null}
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
        <BuyBox product={product} />
      </div>

      <RelatedProducts product={product} />

      {/* Mobile-only, fixed to the viewport, so a visitor who has scrolled the
          gallery and the FAQ can still act. The spacer keeps the footer clear
          of the bar on a phone. */}
      <div aria-hidden className="h-20 md:hidden" />
      <StickyBuyBar product={product} />
    </div>
  );
}
