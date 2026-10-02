import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { CATEGORIES, PRODUCTS } from "@/data/products";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = category && CATEGORIES.some((c) => c.slug === category) ? category : undefined;
  const products = active ? PRODUCTS.filter((p) => p.categorySlug === active) : PRODUCTS;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">Shop</h1>
      <p className="mt-2 text-muted">Every item is laser-measured to your exact car.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className={`rounded-full border px-4 py-1.5 text-sm ${
            !active ? "border-gold text-gold" : "border-line text-white/70 hover:border-gold"
          }`}
        >
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/shop?category=${c.slug}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              active === c.slug ? "border-gold text-gold" : "border-line text-white/70 hover:border-gold"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}
