import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { Product, priceRange } from "@/data/products";
import { fmtNaira } from "@/lib/pricing";

export default function ProductCard({ product }: { product: Product }) {
  const [lo, hi] = priceRange(product);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-line bg-panel transition hover:border-gold"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-panel-2">
        <SafeImage
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(min-width: 768px) 25vw, 50vw"
          className="object-cover transition group-hover:scale-105"
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
