import Link from "next/link";
import { Category } from "@/data/products";

export default function CategoryTile({ category }: { category: Category }) {
  return (
    <Link
      href={`/shop/${category.slug}`}
      className="group rounded-xl border border-border bg-surface p-5 transition hover:border-accent"
    >
      <h3 className="font-display text-lg font-semibold group-hover:text-accent">{category.name}</h3>
      <p className="mt-1 text-sm text-fg-muted">{category.blurb}</p>
    </Link>
  );
}
