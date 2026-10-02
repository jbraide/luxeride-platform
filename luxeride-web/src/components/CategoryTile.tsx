import Link from "next/link";
import { Category } from "@/data/products";

export default function CategoryTile({ category }: { category: Category }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className="group rounded-xl border border-line bg-panel p-5 transition hover:border-gold"
    >
      <h3 className="font-display text-lg font-semibold group-hover:text-gold">{category.name}</h3>
      <p className="mt-1 text-sm text-muted">{category.blurb}</p>
    </Link>
  );
}
