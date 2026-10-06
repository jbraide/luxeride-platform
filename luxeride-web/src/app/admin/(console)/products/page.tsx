import Link from "next/link";

import { prisma } from "@/lib/db";
import { createProduct } from "../catalogue-actions";
import { messageFor, readEcho, readFailures, slugify } from "../catalogue-guard";

/**
 * `/admin/products` — every product in the shop, and the place to add one.
 *
 * THE CAR-SPECIFIC FLAG IS THE MOST IMPORTANT FIELD ON THIS FORM
 *
 * `isCarSpecific` decides whether an item goes through the Fit Finder at all. A
 * floor mat is cut to a specific pan, so selling it means claiming a fit — that is
 * what the whole fitment engine exists to keep honest. A gear cover does not vary
 * by model, so gating its sale on a fitment check would refuse a sale that is
 * perfectly well-defined and push the customer to WhatsApp for no reason.
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

  const [products, categories] = await Promise.all([
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
  ]);

  const label = "block text-xs uppercase tracking-widest text-accent-dim";
  const input =
    "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none";
  const fieldFailed = (field: string) => (failures.has(field) ? "border-[#FF6B35]" : "");

  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className="mt-1 text-xs leading-relaxed text-[#FF6B35]">
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  const defaultRegular = echo("regular") || "45000";
  const defaultPremium = echo("premium") || "58000";

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Products</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Everything the shop sells. A product with no variation has nothing to price, so creating one
        here always creates its first variation too — add the rest on its own page.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/products"
          className={`rounded-full border px-4 py-1.5 text-sm ${
            filter === ""
              ? "border-accent text-accent"
              : "border-border text-fg/70 hover:border-accent hover:text-accent"
          }`}
        >
          All
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              filter === category.slug
                ? "border-accent text-accent"
                : "border-border text-fg/70 hover:border-accent hover:text-accent"
            }`}
          >
            {category.name}
          </Link>
        ))}
      </div>


      {failures.size > 0 && (
        <div className="mt-4 rounded-xl border border-[#FF6B35] px-4 py-3 text-sm">
          <p className="text-[#FF6B35]">
            Not saved. {failures.size} field{failures.size === 1 ? "" : "s"} refused:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-fg-muted">
            {[...failures].map(([field, code]) => (
              <li key={field}>
                <span className="font-mono text-fg/80">{field}</span> — {messageFor(code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Existing products ────────────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">
          In the shop{" "}
          <span className="font-mono text-xs text-accent-dim">{products.length}</span>
        </h3>

        {products.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-surface/60 px-5 py-5 text-sm text-fg-muted">
            No products{filter ? ` in ${filter}` : ""} yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {products.map((product) => (
              <li key={product.id} className="rounded-xl border border-border bg-surface/60 px-4 py-4">
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
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase ${
                        product.isCarSpecific
                          ? "border-accent/50 text-accent"
                          : "border-border text-fg-muted"
                      }`}
                      title={
                        product.isCarSpecific
                          ? "Sold through the Fit Finder — needs a confirmed floor pan."
                          : "Generic — bought from /shop, no car or year needed."
                      }
                    >
                      {product.isCarSpecific ? "per car" : "generic"}
                    </span>
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
                    >
                      Edit &amp; variations →
                    </Link>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-fg-muted">
                  <span>{product.category.name}</span>
                  <span className="font-mono text-accent">
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
      <section className="mt-10">
        <h3 className="font-display text-base font-semibold">Add a product</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          For gear covers, accessories or anything else that is not cut to a floor pan: tick{" "}
          <span className="text-fg/80">generic</span> and it is bought straight from{" "}
          <code className="font-mono text-accent-dim">/shop</code> with no car and no year. Leave it
          unticked and the item is only offered once a floor pan for that car is confirmed.
        </p>

        {categories.length === 0 && (
          <p className="mt-4 rounded-xl border border-border bg-surface/60 px-5 py-5 text-sm text-fg-muted">
            There is no category to put it in yet. Create one on{" "}
            <Link href="/admin/categories" className="text-accent underline-offset-4 hover:underline">
              /admin/categories
            </Link>{" "}
            first.
          </p>
        )}

        {categories.length > 0 && (
          <form method="post" action={createProduct} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="p-name" className={label}>
                Name — required
              </label>
              <input
                id="p-name"
                name="name"
                required
                defaultValue={echo("name")}
                placeholder="Gear Lever Cover"
                className={`${input} ${fieldFailed("name")}`}
              />
              {refusal("name")}
            </div>

            <div>
              <label htmlFor="p-slug" className={label}>
                Slug — required
              </label>
              <input
                id="p-slug"
                name="slug"
                required
                defaultValue={echo("slug")}
                placeholder="gear-lever-cover"
                className={`${input} ${fieldFailed("slug")} font-mono`}
              />
              {refusal("slug")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Becomes <code className="font-mono text-accent-dim">/products/&lt;slug&gt;</code>.{" "}
                <span className="font-mono">{slugify("Gear Lever Cover")}</span> is what a blank
                would become.
              </p>
            </div>

            <div>
              <label htmlFor="p-category" className={label}>
                Category — required
              </label>
              <select
                id="p-category"
                name="categorySlug"
                required
                defaultValue={echo("categorySlug")}
                className={`${input} ${fieldFailed("categorySlug")}`}
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
              <label htmlFor="p-regular" className={label}>
                Regular price — required
              </label>
              <input
                id="p-regular"
                name="regular"
                type="number"
                inputMode="numeric"
                required
                defaultValue={defaultRegular}
                className={`${input} ${fieldFailed("regular")} font-mono`}
              />
              {refusal("regular")}
            </div>

            <div>
              <label htmlFor="p-premium" className={label}>
                Premium price — required
              </label>
              <input
                id="p-premium"
                name="premium"
                type="number"
                inputMode="numeric"
                required
                defaultValue={defaultPremium}
                className={`${input} ${fieldFailed("premium")} font-mono`}
              />
              {refusal("premium")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Both prices, always. A regular-brand car pays the first, a premium-brand one the
                second.
              </p>
            </div>

            <div>
              <label htmlFor="p-note" className={label}>
                Short line shown under the name
              </label>
              <input
                id="p-note"
                name="note"
                defaultValue={echo("note")}
                className={input}
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="p-availability" className={label}>
                Availability sentence
              </label>
              <input
                id="p-availability"
                name="availability"
                defaultValue={echo("availability")}
                placeholder="Made to order. Fits any car with the same gear lever."
                className={`${input} ${fieldFailed("availability")}`}
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
              <label htmlFor="p-surcharge" className={label}>
                3-row surcharge
              </label>
              <input
                id="p-surcharge"
                name="threeRowSurcharge"
                type="number"
                inputMode="numeric"
                defaultValue={echo("threeRowSurcharge")}
                className={`${input} ${fieldFailed("threeRowSurcharge")} font-mono`}
              />
              {refusal("threeRowSurcharge")}
              <p className="mt-1 text-[11px] text-fg-muted">
                Only for a row-dependent item. A surcharge on something that is not row-dependent is
                refused rather than stored — a number nothing can trigger is one that gets quoted by
                accident.
              </p>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
              >
                Create product
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}