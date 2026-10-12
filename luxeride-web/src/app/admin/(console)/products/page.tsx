import Link from "next/link";

import { prisma } from "@/lib/db";
import EmptyState from "@/components/admin/EmptyState";
import FieldErrors from "@/components/admin/FieldErrors";
import PageHeader from "@/components/admin/PageHeader";
import StatusChip from "@/components/admin/StatusChip";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  FIELD_ERROR,
  INPUT,
  LABEL,
  SECTION_HINT,
  SECTION_TITLE,
  chip,
  inputState,
} from "@/components/admin/ui";
import { createProduct } from "../catalogue-actions";
import { messageFor, readEcho, readFailures, slugify } from "../catalogue-guard";

/**
 * `/admin/products` — every product in the shop, and the place to add one.
 *
 * THE FIT FINDER FLAG IS THE MOST IMPORTANT FIELD ON THIS FORM
 *
 * `isCarSpecific` decides whether an item is offered by the Fit Finder at all. Floor
 * mats are the product the Fit Finder exists for, so they are ticked; a cargo liner is
 * cut to a boot, so it CAN be ticked when the owner wants it offered by car. A seat
 * cover, a mud flap or a bundle is sold from the shop without a car, so it is not.
 *
 * It is a flag rather than something inferred because nothing in the data can
 * derive it and getting it wrong is expensive in both directions: `true` on a
 * generic product hides it from everyone who does not own a confirmed car, and
 * `false` on a mat is the "we sell this for your car" claim this project exists to
 * prevent. So it is the owner's call, stated in those terms.
 *
 * Every product gets its FIRST variation on creation — see `createProduct`. A
 * product with no variation has nothing the storefront can price, so saving one
 * without it would create something that exists in the admin and cannot appear on
 * the shop.
 */

/**
 * `force-dynamic` because this screen reads Postgres, and reading a database is
 * not a dynamic API as far as Next is concerned. Without it the page is
 * prerendered at build time and the console shows a build-day snapshot of the
 * catalogue — which is the same defect `next build` caught on `/admin` and
 * `/admin/demand`, and the same fix. See master-build-plan M9.3.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const failures = readFailures(query);
  const echo = readEcho(query);
  const filter = typeof query.category === "string" ? query.category : "";

  const [products, categories, perCategory] = await Promise.all([
    prisma.product.findMany({
      where: filter ? { category: { slug: filter } } : {},
      include: {
        category: { select: { slug: true, name: true } },
        variations: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        _count: { select: { layoutVariants: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true } }),
  ]);

  /*
   * The count behind each filter chip and behind "All", so the bar carries the size
   * of each set before a click — the same thing `/admin/vehicles` now does. `All` is
   * the sum of the per-category counts, which is the number of products that exist
   * regardless of which category is showing.
   */
  const totalProducts = perCategory.reduce((sum, row) => sum + row._count._all, 0);
  const countForCategory = (id: string): number =>
    perCategory.find((row) => row.categoryId === id)?._count._all ?? 0;

  // The filter chip now comes from `@/components/admin/ui`, in one place so `All` and
  // each category cannot drift apart — the same shape `/admin/vehicles` uses.

  /*
   * The per-field refusal stays a local helper — it needs THIS screen's `failures` map
   * and `messageFor` — but it renders the shared `FIELD_ERROR` class now.
   */
  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className={FIELD_ERROR}>
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  const defaultRegular = echo("regular") || "45000";
  const defaultPremium = echo("premium") || "58000";

  return (
    <div>
      <PageHeader
        title="Products"
        meta="Everything the shop sells. A product with no variation has nothing to price, so creating one here always creates its first variation too — add the rest on its own page."
        actions={
          <a href="#add-product" className={BTN_SECONDARY}>
            Add a product
          </a>
        }
      />

      <nav aria-label="Filter products" className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/products" aria-current={filter === "" ? "page" : undefined} className={chip(filter === "")}>
          All
          <span className={filter === "" ? "text-accent" : "text-accent-dim"}>{totalProducts}</span>
        </Link>
        {categories.map((category) => {
          const active = filter === category.slug;
          return (
            <Link
              key={category.id}
              href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
              aria-current={active ? "page" : undefined}
              className={chip(active)}
            >
              {category.name}
              <span className={active ? "text-accent" : "text-accent-dim"}>
                {countForCategory(category.id)}
              </span>
            </Link>
          );
        })}
      </nav>


      <FieldErrors failures={failures} message={messageFor} />

      {/* ── Existing products ────────────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className={SECTION_TITLE}>
          In the shop{" "}
          <span className="font-mono text-xs text-accent-dim">{products.length}</span>
        </h3>

        {products.length === 0 ? (
          filter ? (
            <EmptyState className="mt-4">
              No products in {filter} yet.{" "}
              <Link href="/admin/products" className={BTN_GHOST}>
                Clear the filter
              </Link>{" "}
              to see all {totalProducts}.
            </EmptyState>
          ) : (
            <EmptyState className="mt-4">No products yet. Add the first one below.</EmptyState>
          )
        ) : (
          <ul className="mt-4 space-y-2">
            {products.map((product) => (
              <li key={product.id} className={`${CARD} px-4 py-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-sm text-fg/80">
                    {product.name}
                    <span className="ml-2 font-mono text-[11px] text-accent-dim">
                      /products/{product.slug}
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    {/* The flag, always visible, because it is the decision that
                        changes where the product can be bought. */}
                    <StatusChip
                      tone={product.isCarSpecific ? "accent" : "neutral"}
                      title={
                        product.isCarSpecific
                          ? "In the Fit Finder — offered for a car."
                          : "Shop only — bought without a car."
                      }
                    >
                      {product.isCarSpecific ? "in Fit Finder" : "shop only"}
                    </StatusChip>
                    <Link href={`/admin/products/${product.id}`} className={BTN_GHOST}>
                      Edit &amp; variations →
                    </Link>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-fg-muted">
                  <span>{product.category.name}</span>
                  <span className="tabular font-mono text-accent">
                    ₦{product.regular.toLocaleString("en-NG")} regular / ₦
                    {product.premium.toLocaleString("en-NG")} premium
                  </span>
                  {product.rowApplicable && product.threeRowSurcharge !== null && (
                    <span>3-row +₦{product.threeRowSurcharge.toLocaleString("en-NG")}</span>
                  )}
                  <span>
                    {product.variations.length} variation
                    {product.variations.length === 1 ? "" : "s"}
                  </span>
                  {product._count.layoutVariants > 0 && (
                    <span className="text-accent-dim">
                      cut for {product._count.layoutVariants} car
                      {product._count.layoutVariants === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Add one ──────────────────────────────────────────────────────── */}
      <section id="add-product" className="mt-10">
        <h3 className={SECTION_TITLE}>Add a product</h3>
        <p className={SECTION_HINT}>
          For gear covers, accessories or anything else that is not cut to a floor pan: tick{" "}
          <span className="text-fg/80">generic</span> and it is bought straight from{" "}
          <code className="font-mono text-accent-dim">/shop</code> with no car and no year. Leave it
          unticked and the item is only offered once a floor pan for that car is confirmed.
        </p>

        {categories.length === 0 && (
          <EmptyState className="mt-4">
            There is no category to put it in yet. Create one on{" "}
            <Link href="/admin/categories" className={BTN_GHOST}>
              /admin/categories
            </Link>{" "}
            first.
          </EmptyState>
        )}

        {categories.length > 0 && (
          <form method="post" action={createProduct} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="p-name" className={LABEL}>
                Name — required
              </label>
              <input
                id="p-name"
                name="name"
                required
                defaultValue={echo("name")}
                placeholder="Gear Lever Cover"
                className={`${INPUT} ${inputState(failures.has("name"))}`}
              />
              {refusal("name")}
            </div>

            <div>
              <label htmlFor="p-slug" className={LABEL}>
                Slug — required
              </label>
              <input
                id="p-slug"
                name="slug"
                required
                defaultValue={echo("slug")}
                placeholder="gear-lever-cover"
                className={`${INPUT} ${inputState(failures.has("slug"))} font-mono`}
              />
              {refusal("slug")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Becomes <code className="font-mono text-accent-dim">/products/&lt;slug&gt;</code>.{" "}
                <span className="font-mono">{slugify("Gear Lever Cover")}</span> is what a blank
                would become.
              </p>
            </div>

            <div>
              <label htmlFor="p-category" className={LABEL}>
                Category — required
              </label>
              <select
                id="p-category"
                name="categorySlug"
                required
                defaultValue={echo("categorySlug")}
                className={`${INPUT} ${inputState(failures.has("categorySlug"))}`}
              >
                <option value="">Choose…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
              {refusal("categorySlug")}
            </div>

            <div>
              <label htmlFor="p-regular" className={LABEL}>
                Regular price — required
              </label>
              <input
                id="p-regular"
                name="regular"
                type="number"
                inputMode="numeric"
                required
                defaultValue={defaultRegular}
                className={`${INPUT} ${inputState(failures.has("regular"))} font-mono`}
              />
              {refusal("regular")}
            </div>

            <div>
              <label htmlFor="p-premium" className={LABEL}>
                Premium price — required
              </label>
              <input
                id="p-premium"
                name="premium"
                type="number"
                inputMode="numeric"
                required
                defaultValue={defaultPremium}
                className={`${INPUT} ${inputState(failures.has("premium"))} font-mono`}
              />
              {refusal("premium")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Both prices, always. A regular-brand car pays the first, a premium-brand one the
                second.
              </p>
            </div>

            <div>
              <label htmlFor="p-note" className={LABEL}>
                Short line shown under the name
              </label>
              <input id="p-note" name="note" defaultValue={echo("note")} className={INPUT} />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="p-availability" className={LABEL}>
                Availability sentence
              </label>
              <input
                id="p-availability"
                name="availability"
                defaultValue={echo("availability")}
                placeholder="Made to order. Fits any car with the same gear lever."
                className={`${INPUT} ${inputState(failures.has("availability"))}`}
              />
              {refusal("availability")}
              <p className="mt-1 text-[11px] text-fg-muted">
                This is the one sentence on the page that says what is true. No catalogue product
                claims stock for a specific car.
              </p>
            </div>

            <div className="sm:col-span-3 flex flex-wrap items-start gap-6">
              <label className="flex items-center gap-3 text-sm text-fg/80">
                <input
                  type="checkbox"
                  name="isCarSpecific"
                  defaultChecked={echo("isCarSpecific") !== "off"}
                  className="accent-gold"
                />
                <span>
                  Needs a car
                  <span className="block text-[11px] text-fg-muted">
                    Cut to a specific floor pan — sold through the Fit Finder. Untick for something
                    generic like a gear cover.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm text-fg/80">
                <input type="checkbox" name="rowApplicable" className="accent-gold" />
                <span>
                  Row-dependent
                  <span className="block text-[11px] text-fg-muted">
                    A 3-row car needs more of it than a 2-row one.
                  </span>
                </span>
              </label>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="p-surcharge" className={LABEL}>
                3-row surcharge
              </label>
              <input
                id="p-surcharge"
                name="threeRowSurcharge"
                type="number"
                inputMode="numeric"
                defaultValue={echo("threeRowSurcharge")}
                className={`${INPUT} ${inputState(failures.has("threeRowSurcharge"))} font-mono`}
              />
              {refusal("threeRowSurcharge")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Only for a row-dependent item. A surcharge on something that is not row-dependent is
                refused rather than stored — a number nothing can trigger is one that gets quoted by
                accident.
              </p>
            </div>

            <div className="sm:col-span-3">
              <button type="submit" className={BTN_PRIMARY}>
                Create product
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}