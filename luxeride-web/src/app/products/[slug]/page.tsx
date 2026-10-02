import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { LinkButton } from "@/components/Button";
import { PRODUCTS, priceRange, getProductBySlug } from "@/data/products";
import { fmtNaira } from "@/lib/pricing";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const [lo, hi] = priceRange(product);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="flex gap-3 overflow-x-auto">
          {product.images.map((src) => (
            <div key={src} className="relative h-40 w-52 flex-shrink-0 overflow-hidden rounded-xl border border-line bg-panel-2">
              <SafeImage src={src} alt={product.name} fill className="object-cover" />
            </div>
          ))}
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold">{product.name}</h1>
          <p className="mt-2 text-muted">{product.note}</p>

          <p className="mt-5 font-mono text-2xl font-bold text-gold">
            {fmtNaira(lo)}
            {hi !== lo ? ` – ${fmtNaira(hi)}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            {product.rowApplicable
              ? "Final price depends on your car's tier and row configuration."
              : "Final price depends on your car's tier."}
          </p>

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
