import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import CatalogExplorer from "@/components/CatalogExplorer";
import { LinkButton } from "@/components/Button";
import { CATEGORIES, getCategoryBySlug, PRODUCTS } from "@/data/products";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { resolveAllMedia } from "@/lib/media-manifest";

/**
 * A category is a real route, not a query filter.
 *
 * `/shop?category=floor-mats` cannot be canonicalised, cannot be listed in a
 * sitemap, and competes with every other filter of the same document. As a path
 * it does all three. `next.config.ts` redirects the old query form here so
 * existing links and any shared ad URL keep working.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return {};

  return pageMetadata({
    title: category.seoTitle,
    description: category.seoDescription,
    path: `/shop/${category.slug}`,
    image: `/shop/${category.slug}/opengraph-image`,
  });
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const products = PRODUCTS.filter((product) => product.categorySlug === category.slug);

  const trail = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    { name: category.name, path: `/shop/${category.slug}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />

      <h1 className="font-display text-3xl font-semibold">{category.name}</h1>
      <p className="mt-2 text-muted">{category.heroLine}</p>

      {products.length === 0 ? (
        // §6.4. An empty grid with no explanation reads as a broken shop, so the
        // category is named and two ways out are offered rather than nothing.
        <div className="mt-8 rounded-xl border border-line bg-panel/60 px-5 py-8 text-center">
          <p className="text-sm text-muted">
            Nothing listed under {category.name} yet. We add products as we confirm we can
            make them for your exact car.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton href="/shop">Browse all products</LinkButton>
            <LinkButton href="/fit-finder" variant="outline">
              Find my perfect fit
            </LinkButton>
          </div>
        </div>
      ) : (
        <>
          <CatalogExplorer products={products} mediaBySlug={resolveAllMedia(products.map((p) => p.slug))} />

          <div className="mt-10 flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c.slug !== category.slug).map((c) => (
              <Link
                key={c.slug}
                href={`/shop/${c.slug}`}
                className="rounded-full border border-line px-4 py-1.5 text-sm text-white/70 hover:border-gold hover:text-gold"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}