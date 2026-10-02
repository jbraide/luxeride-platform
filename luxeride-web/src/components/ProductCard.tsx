import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { Product, priceRange } from "@/data/products";
import { resolveMedia } from "@/lib/media-manifest";
import { fmtNaira } from "@/lib/pricing";

export default function ProductCard({ product, preload = false }: { product: Product; preload?: boolean }) {
  const [lo, hi] = priceRange(product);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-line bg-panel transition hover:border-gold"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-panel-2">
        <ProductImage
          media={resolveMedia(product.slug)}
          name={product.name}
          // Matches the grid this card renders inside:
          // grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 in ProductCard's parents.
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition group-hover:scale-105"
          preload={preload}
        />
      </div>
      <div className="p-4">
        <h3 className="font-display text-base font-semibold">{product.name}</h3>
        <p className="mt-1 text-xs text-muted">{product.note}</p>
        <p className="mt-2 font-mono text-sm text-gold">
          {fmtNaira(lo)}
          {hi !== lo ? ` – ${fmtNaira(hi)}` : ""}
        </p>
      </div>
    </Link>
  );
}
