import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import CatalogExplorer from "@/components/CatalogExplorer";
import renderSection from "@/components/funnel/render-section";
import { LinkButton } from "@/components/Button";
import { CATEGORY_FUNNEL_SECTIONS } from "@/data/funnel/category-sections";
import { getCategory, listCategories, listCategoryWithSales } from "@/lib/catalogue";
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
/**
 * Categories come from the DATABASE, so `generateStaticParams` cannot run at build
 * time — a category created in `/admin/categories` would simply not exist as a path.
 * `dynamicParams = false` is therefore GONE along with it: it is what makes an
 * unlisted slug a 404, and with a database catalogue "unlisted" no longer means
 * anything. The `notFound()` in the page body is what now handles an unknown slug,
 * and it does so on real data rather than on a build-time list.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};

  return pageMetadata({
    // A category created in `/admin/categories` has no authored SEO title. The
    // category's own NAME is the honest fallback — it is what the page is about,
    // and it is already written — rather than the site-wide title, which would put
    // every uncategorised page in the shop competing under the same query.
    title: category.seoTitle ?? category.name,
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
  const category = await getCategory(slug);
  if (!category) notFound();
  // One `Promise.all` for both reads: the sibling-category strip and this category's
  // products are independent, and the page is dynamic now so neither is free.
  const [products, allCategories] = await Promise.all([
    listCategoryWithSales(slug),
    listCategories(),
  ]);

  const trail = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    { name: category.name, path: `/shop/${category.slug}` },
  ];

  // The mechanism and comparison for this category, when there is an honest,
  // material-specific one to show (`funnel-pages` 8.1). Empty for every category
  // without an entry, so those render exactly what they rendered before.
  const funnelSections = CATEGORY_FUNNEL_SECTIONS[slug] ?? [];

  return (
    <div>
      <div className={`mx-auto max-w-6xl px-5 pt-12 ${funnelSections.length > 0 ? "pb-8" : ""}`}>
        <JsonLd data={breadcrumbJsonLd(trail)} />
        <Breadcrumbs trail={trail} />

        <h1 className="font-display text-3xl font-semibold">{category.name}</h1>
        <p className="mt-2 text-fg-muted">{category.heroLine}</p>
      </div>

      {/*
        The funnel sections sit OUTSIDE the padded container so their borders band
        the full width, the way every other section on the site does. They are keyed
        by slug, so a category with no honest material-specific content shows none
        rather than a generic block (Requirement 9.3).
      */}
      {funnelSections.length > 0 ? (
        <div>
          {funnelSections.map((section, index) => (
            <Fragment key={index}>{renderSection(section)}</Fragment>
          ))}
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-5 pb-12">
        {products.length === 0 ? (
          // §6.4. An empty grid with no explanation reads as a broken shop, so the
          // category is named and two ways out are offered rather than nothing.
          <div className="mt-8 rounded-xl border border-border bg-surface/60 px-5 py-8 text-center">
            <p className="text-sm text-fg-muted">
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
            <CatalogExplorer
              products={products}
              mediaBySlug={resolveAllMedia(products.map((p) => p.slug))}
              categoryNames={Object.fromEntries(allCategories.map((c) => [c.slug, c.name]))}
            />

            <div className="mt-10 flex flex-wrap gap-2">
              {allCategories.filter((c) => c.slug !== category.slug).map((c) => (
                <Link
                  key={c.slug}
                  href={`/shop/${c.slug}`}
                  className="rounded-full border border-border px-4 py-1.5 text-sm text-fg/70 hover:border-accent hover:text-accent"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}