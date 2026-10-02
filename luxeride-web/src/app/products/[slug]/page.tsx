import { notFound } from "next/navigation";
import ProductGallery from "@/components/ProductGallery";
import { LinkButton } from "@/components/Button";
import { PRODUCTS, getProductBySlug } from "@/data/products";
import { formatDeliverySummary, formatPriceFrom } from "@/lib/availability";
import { resolveMedia } from "@/lib/media-manifest";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
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
        </div>
      </div>
    </div>
  );
}
