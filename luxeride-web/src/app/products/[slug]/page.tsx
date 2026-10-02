import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductFaq from "@/components/ProductFaq";
import ProductGallery from "@/components/ProductGallery";
import RelatedProducts from "@/components/RelatedProducts";
import { LinkButton } from "@/components/Button";
import { PRODUCTS, getCategoryBySlug, getProductBySlug } from "@/data/products";
import { formatDeliverySummary, formatPriceFrom } from "@/lib/availability";
import { resolveMedia } from "@/lib/media-manifest";
import { pageMetadata } from "@/lib/seo";

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

  const price = formatPriceFrom(product);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div>
          <ProductGallery media={resolveMedia(product.slug)} name={product.name} />
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold">{product.name}</h1>
          <p className="mt-2 text-muted">{product.note}</p>

          {/* A band, never one number: a single figure is one the WhatsApp quote
              can contradict. storefront-catalog §7.3. */}
          <p className="mt-5 font-mono text-2xl font-bold text-gold">{price.from}</p>
          <p className="mt-1 text-xs text-muted">
            {price.range} — {price.reason}
          </p>
          {/* No availability claim. Nothing in the app establishes stock for a
              specific car, so the honest sentence is about making the item. */}
          <p className="mt-3 text-xs text-muted">{product.availability}</p>
          <p className="mt-3 text-xs text-muted">{formatDeliverySummary()}</p>

          <div className="mt-6 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs text-gold">
            🛡️ 100% Perfect Fit Guarantee — doesn&apos;t fit? We swap it free.
          </div>

          <div className="mt-6">
            <LinkButton href={`/fit-finder?product=${product.slug}`}>
              Select My Car &amp; Add to Cart
            </LinkButton>
          </div>

          <ProductFaq product={product} />
        </div>
      </div>

      <RelatedProducts product={product} />
    </div>
  );
}
