import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductFaq from "@/components/ProductFaq";
import ProductGallery from "@/components/ProductGallery";
import RelatedProducts from "@/components/RelatedProducts";
import { LinkButton } from "@/components/Button";
import { PRODUCTS, getCategoryBySlug, getProductBySlug } from "@/data/products";
import { formatDeliverySummary, formatPriceFrom } from "@/lib/availability";
import { resolveMedia } from "@/lib/media-manifest";

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
 * Part of `storefront-catalog` §10.8 — the half that needs no deployment fact.
 *
 * Before this, all seven product pages emitted the identical root title, so
 * seven distinct products competed for one query as one page.
 *
 * **Deliberately incomplete, and the reason is measured, not assumed.**
 *
 * §10.8 asks for `pageMetadata()` — a self-referencing canonical, a 120–160
 * character description and an `og:image`. All three are M3.1's `src/lib/seo.tsx`,
 * which needs `metadataBase` and therefore `NEXT_PUBLIC_SITE_URL`; §3.1's own
 * compile-time gate is exactly right about the split, because a title and a
 * description are **compile-time facts** while a canonical and an `og:image` are
 * **deployment facts**. D-05 is undecided, so the deployment half cannot be
 * written. Next merges metadata per field, so leaving `description` unset here
 * inherits the root layout's rather than emitting an empty one.
 *
 * The description is not a case of "not got round to it": composing one from
 * `note` + `materials` + `AVAILABILITY_COPY` was measured across all seven
 * products and lands between 122 and 176 characters — three of the seven over
 * §10.8's ceiling — while dropping the availability sentence lands between 74
 * and 128 — most under its floor. Fitting the band needs authored per-product
 * copy, which belongs in M3.1 alongside the other twelve routes' metadata rather
 * than invented here for seven pages.
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

  return { title: `${product.name}${suffix}` };
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
