import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  addBundleItem,
  archiveProduct,
  archiveVariation,
  createVariation,
  deleteProduct,
  deleteVariation,
  removeBundle,
  removeBundleItem,
  saveBundle,
  unarchiveProduct,
  unarchiveVariation,
  updateProduct,
  updateVariation,
} from "../../catalogue-actions";
import { messageFor, readEcho, readFailures, slugify, STOCK_STATES } from "../../catalogue-guard";
import { BUNDLE_DISCOUNT_KINDS, deriveBundlePrices, MIN_BUNDLE_PRICE } from "@/lib/bundle-price";

/**
 * `/admin/products/[id]` — one product, and its VARIATIONS.
 *
 * WHAT A VARIATION IS, AND WHY IT IS NOT A PRODUCT
 *
 * A variation is an OPTION on a product with its own price: a gear cover that fits
 * a 5-speed stick is not the same object, and not the same price, as the same cover
 * for an automatic. The owner's requirement was "the ability to have variation per
 * item, similar to the floormats".
 *
 * Making that a column would mean a second price column, then a third when the
 * second needs one, and the storefront branching on which are populated. As a row
 * it has an identity, so a floor pan's per-year price and a sold order line can
 * both point at it. See `ProductVariation` in the schema for the full argument.
 *
 * WHAT A PRICE HERE DOES AND DOES NOT CHANGE
 *
 * It changes the SHOP price: what a generic product costs, and what a car-specific
 * product's price starts from. It does NOT change what a confirmed car is quoted.
 * That is `RangePrice` — the per-year figure on the car screen, where the years
 * are visible — and rewriting 200 confirmed cars' quotes from a shop edit is not
 * something a shop edit should be able to do.
 *
 * NO `'use client'`, like every screen in this console.
 */

/**
 * `force-dynamic` because this screen reads Postgres, and reading a database is
 * not a dynamic API as far as Next is concerned. Without it the page is
 * prerendered at build time and the console shows a build-day snapshot of the
 * catalogue — which is the same defect `next build` caught on `/admin` and
 * `/admin/demand`, and the same fix. See master-build-plan M9.3.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Product" };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { slug: true, name: true } },
        variations: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: { _count: { select: { orderItems: true, layoutVariants: true } } },
        },
        /*
         * THE BUNDLE'S COMPOSITION, for the editor below.
         *
         * Each item carries its part's product AND its variation, because the price a
         * part contributes is the VARIATION's when one is named — `ProductVariation`
         * exists to carry a price, so summing the product's list price instead would be
         * summing a number nobody sells.
         */
        bundle: {
          include: {
            items: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: {
                product: { select: { slug: true, name: true, regular: true, premium: true } },
                variation: { select: { id: true, name: true, regular: true, premium: true } },
              },
            },
          },
        },
        _count: { select: { layoutVariants: true, orderItems: true } },
        /*
         * WHAT THE FRONT END ACTUALLY QUOTES FOR A CAR.
         *
         * Locked decision 3 puts the price on the layout as `priceFrom`, so for a
         * confirmed vehicle the storefront shows THIS figure, not the catalogue prices
         * below. Loading it here is what lets the editor show both side by side rather
         * than letting a catalogue-price edit silently lose to, or overwrite, a layout
         * price (Requirement 7).
         */
        layoutVariants: {
          select: {
            id: true,
            kind: true,
            priceFrom: true,
            layout: { select: { internalCode: true, customerName: true } },
          },
          orderBy: { kind: "asc" },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!product) notFound();

  /*
   * WHAT MAY BE ADDED AS A PART, and why the list is not simply "every product".
   *
   *   - Not this product: a bundle containing itself has no price, because the price
   *     would be derived from itself.
   *   - Not another bundle: pricing an outer bundle from an inner one is a recursion
   *     with no base case. The answer to "a bundle of bundles" is one bundle with the
   *     parts listed flat, which is what the owner can already build here.
   *
   * `isCarSpecific` is deliberately NOT a filter. The mats and the covers — the parts
   * almost every bundle is made of — are `true`, because they are cut for a specific car.
   * Filtering them out would leave nothing to bundle but the mud flaps and the sun
   * shades, which is exactly backwards.
   *
   * Loaded here rather than in the action so the `<select>` shows only legal options —
   * the action still refuses the illegal ones, because a select is a UI convenience and
   * a Server Action is a POST anybody can send.
   */
  const candidates = await prisma.product.findMany({
    where: {
      id: { not: id },
      bundle: null,
    },
    select: {
      id: true,
      name: true,
      regular: true,
      premium: true,
      variations: {
        select: { id: true, name: true, regular: true, premium: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const failures = readFailures(query);
  const echo = readEcho(query);

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

  const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{product.name}</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
          {product.category.name} · {product.isCarSpecific ? "per car" : "generic"}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-accent-dim">/products/{product.slug}</p>
      {product.archivedAt && (
        <p className="mt-2 inline-block rounded-lg border border-[#FF6B35]/50 px-3 py-1 text-xs text-[#FF6B35]">
          Archived — off the shop. Its order history and prices are kept, and it can be put back
          at any time.
        </p>
      )}


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

      {/* ── The product ──────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">The product</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          These two prices are what the shop quotes. A floor pan&apos;s per-year price is set
          separately, on the car&apos;s own page, and is not changed by anything on this form.
        </p>
        {/*
          THE PRICE IS NOT TYPED ON A BUNDLE, AND SAYING SO HERE IS THE POINT.

          `updateProduct` REFUSES a changed price on a bundle whose price is derived, so
          typing one and pressing Save comes back with a message. Without this note the
          two boxes look exactly like every other product's and the refusal reads as the
          site being broken.
        */}
        {product.bundle?.derivePricing && (
          <p className="mt-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-accent">
            This price is worked out from what is inside the bundle, so these two boxes are
            read-only in effect — change the parts or the discount in the Bundle section
            below and this figure follows.
          </p>
        )}

        {/* Requirement 7: the catalogue price and the layout's `priceFrom` are two
            facts, and the operator has to see which one a confirmed car is quoted.
            Locked decision 3 puts the site's price on the layout, so the layout figure
            is the one that wins wherever a car is involved. */}
        {product.layoutVariants.length > 0 && (
          <div className="mt-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs leading-relaxed text-fg-muted">
            <p className="text-fg/80">
              For a confirmed car the storefront does not show the two boxes below — it shows
              the floor pan&apos;s own price. That figure is the one the customer is quoted
              (locked decision 3):
            </p>
            <ul className="mt-1.5 space-y-0.5 font-mono">
              {product.layoutVariants.map((variant) => (
                <li key={variant.id}>
                  {variant.layout.customerName} · {variant.kind.replace(/_/g, " ")} ·{" "}
                  <span className="text-accent">{naira(variant.priceFrom)}</span>{" "}
                  <span className="text-fg-muted">({variant.layout.internalCode})</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5">
              Editing the prices below changes the shop figure only. It never rewrites a floor
              pan&apos;s price, which is set per year range on the car&apos;s own page.
            </p>
          </div>
        )}

        <form method="post" action={updateProduct} className="mt-4 grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="id" value={product.id} />
          <div>
            <label htmlFor="name" className={label}>
              Name — required
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={echo("name") || product.name}
              className={`${input} ${fieldFailed("name")}`}
            />
            {refusal("name")}
          </div>
          <div>
            <label htmlFor="slug" className={label}>
              Slug — required
            </label>
            <input
              id="slug"
              name="slug"
              required
              defaultValue={echo("slug") || product.slug}
              className={`${input} ${fieldFailed("slug")} font-mono`}
            />
            {refusal("slug")}
          </div>
          <div>
            <label htmlFor="categorySlug" className={label}>
              Category — required
            </label>
            <select
              id="categorySlug"
              name="categorySlug"
              required
              defaultValue={echo("categorySlug") || product.category.slug}
              className={`${input} ${fieldFailed("categorySlug")}`}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            {refusal("categorySlug")}
          </div>

          <div>
            <label htmlFor="regular" className={label}>
              Regular price — required
            </label>
            <input
              id="regular"
              name="regular"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("regular") || String(product.regular)}
              className={`${input} ${fieldFailed("regular")} font-mono`}
            />
            {refusal("regular")}
          </div>
          <div>
            <label htmlFor="premium" className={label}>
              Premium price — required
            </label>
            <input
              id="premium"
              name="premium"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("premium") || String(product.premium)}
              className={`${input} ${fieldFailed("premium")} font-mono`}
            />
            {refusal("premium")}
          </div>
          <div>
            <label htmlFor="threeRowSurcharge" className={label}>
              3-row surcharge
            </label>
            <input
              id="threeRowSurcharge"
              name="threeRowSurcharge"
              type="number"
              inputMode="numeric"
              defaultValue={echo("threeRowSurcharge") || (product.threeRowSurcharge ?? "")}
              className={`${input} ${fieldFailed("threeRowSurcharge")} font-mono`}
            />
            {refusal("threeRowSurcharge")}
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="note" className={label}>
              Short line under the name
            </label>
            <input
              id="note"
              name="note"
              defaultValue={echo("note") || (product.note ?? "")}
              className={input}
            />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="availability" className={label}>
              Availability sentence
            </label>
            <input
              id="availability"
              name="availability"
              defaultValue={echo("availability") || (product.availability ?? "")}
              className={`${input} ${fieldFailed("availability")}`}
            />
            {refusal("availability")}
          </div>

          <div className="sm:col-span-3 flex flex-wrap items-start gap-6">
            <label className="flex items-center gap-3 text-sm text-fg/80">
              <input
                type="checkbox"
                name="isCarSpecific"
                defaultChecked={product.isCarSpecific}
                className="accent-gold"
              />
              <span>
                Needs a car
                <span className="block text-[11px] text-fg-muted">
                  Sold through the Fit Finder, only once a floor pan for that car is confirmed.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm text-fg/80">
              <input
                type="checkbox"
                name="rowApplicable"
                defaultChecked={product.rowApplicable}
                className="accent-gold"
              />
              <span>
                Row-dependent
                <span className="block text-[11px] text-fg-muted">
                  A 3-row car needs more of it than a 2-row one.
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
            >
              Save product
            </button>
            <Link
              href="/admin/products"
              className="text-sm text-fg-muted underline-offset-4 hover:text-accent hover:underline"
            >
              Back to products
            </Link>
          </div>
        </form>
      </section>

      {/* ── Variations ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h3 className="font-display text-base font-semibold">
          Variations{" "}
          <span className="font-mono text-xs text-accent-dim">{product.variations.length}</span>
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          The options on this product, each with its own price. A variation that has been sold
          cannot be deleted — mark it out of stock instead, which stops the sale and keeps the order
          history readable.
        </p>

        {product.variations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[#FF6B35] px-5 py-5 text-sm text-[#FF6B35]">
            This product has no variations, so there is nothing for the shop to price or sell. Add
            one below.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {product.variations.map((variation) => (
              <li key={variation.id} className="rounded-xl border border-border bg-surface/60 px-4 py-4">
                <form method="post" action={updateVariation} className="grid gap-3 sm:grid-cols-6">
                  <input type="hidden" name="id" value={variation.id} />
                  <input type="hidden" name="productId" value={product.id} />
                  <div className="sm:col-span-2">
                    <label htmlFor={`vname__${variation.id}`} className={label}>
                      Name
                    </label>
                    <input
                      id={`vname__${variation.id}`}
                      name={`name__${variation.id}`}
                      defaultValue={echo(`name__${variation.id}`) || variation.name}
                      className={`${input} ${fieldFailed(`name__${variation.id}`)}`}
                    />
                    {refusal(`name__${variation.id}`)}
                  </div>
                  <div>
                    <label htmlFor={`vslug__${variation.id}`} className={label}>
                      Slug
                    </label>
                    <input
                      id={`vslug__${variation.id}`}
                      name={`slug__${variation.id}`}
                      defaultValue={echo(`slug__${variation.id}`) || variation.slug}
                      className={`${input} font-mono`}
                    />
                    {refusal(`slug__${variation.id}`)}
                  </div>
                  <div>
                    <label htmlFor={`vreg__${variation.id}`} className={label}>
                      Regular
                    </label>
                    <input
                      id={`vreg__${variation.id}`}
                      name={`regular__${variation.id}`}
                      type="number"
                      inputMode="numeric"
                      required
                      defaultValue={echo(`regular__${variation.id}`) || String(variation.regular)}
                      className={`${input} ${fieldFailed(`regular__${variation.id}`)} font-mono`}
                    />
                    {refusal(`regular__${variation.id}`)}
                  </div>
                  <div>
                    <label htmlFor={`vprem__${variation.id}`} className={label}>
                      Premium
                    </label>
                    <input
                      id={`vprem__${variation.id}`}
                      name={`premium__${variation.id}`}
                      type="number"
                      inputMode="numeric"
                      required
                      defaultValue={echo(`premium__${variation.id}`) || String(variation.premium)}
                      className={`${input} ${fieldFailed(`premium__${variation.id}`)} font-mono`}
                    />
                    {refusal(`premium__${variation.id}`)}
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor={`vstock__${variation.id}`} className={label}>
                      Stock
                    </label>
                    <select
                      id={`vstock__${variation.id}`}
                      name={`stockState__${variation.id}`}
                      defaultValue={
                        echo(`stockState__${variation.id}`) || variation.stockState
                      }
                      className={`${input} ${fieldFailed(`stockState__${variation.id}`)}`}
                    >
                      {STOCK_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    {refusal(`stockState__${variation.id}`)}
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`vsku__${variation.id}`} className={label}>
                      SKU (optional, internal)
                    </label>
                    <input
                      id={`vsku__${variation.id}`}
                      name={`sku__${variation.id}`}
                      defaultValue={echo(`sku__${variation.id}`) || (variation.sku ?? "")}
                      className={`${input} font-mono`}
                    />
                    {refusal(`sku__${variation.id}`)}
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
                    >
                      Save
                    </button>
                  </div>

                  <div className="sm:col-span-6 flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-3">
                    <span className="text-[11px] text-fg-muted">
                      {variation.archivedAt && (
                        <span className="text-[#FF6B35]">Archived · </span>
                      )}
                      {naira(variation.regular)} regular · {naira(variation.premium)} premium
                      {variation._count.orderItems > 0 &&
                        ` · sold ${variation._count.orderItems}×`}
                      {variation._count.layoutVariants > 0 &&
                        ` · offered on ${variation._count.layoutVariants} floor pan${
                          variation._count.layoutVariants === 1 ? "" : "s"
                        }`}
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        formAction={deleteVariation}
                        disabled={variation._count.orderItems > 0}
                        title={
                          variation._count.orderItems > 0
                            ? "This variation has been sold. Archive it or mark it out of stock instead."
                            : "Delete this variation"
                        }
                        className="text-xs text-fg-muted underline-offset-4 hover:text-[#FF6B35] hover:text-[#FF6B35] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                      {/* Requirement 6.3: a variation that cannot be deleted still has an
                          honest, reversible path — off the product page, kept for the order. */}
                      <button
                        type="submit"
                        formAction={variation.archivedAt ? unarchiveVariation : archiveVariation}
                        title={
                          variation.archivedAt
                            ? "Put this option back on the product page"
                            : "Take this option off the product page without deleting anything"
                        }
                        className="text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
                      >
                        {variation.archivedAt ? "Put back" : "Archive"}
                      </button>
                    </span>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* ── Add one ────────────────────────────────────────────────────── */}
        <form
          method="post"
          action={createVariation}
          className="mt-4 grid gap-4 rounded-xl border border-dashed border-border px-4 py-4 sm:grid-cols-6"
        >
          <input type="hidden" name="productId" value={product.id} />
          <div className="sm:col-span-2">
            <label htmlFor="new-v-name" className={label}>
              Name — required
            </label>
            <input
              id="new-v-name"
              name="name"
              required
              defaultValue={echo("name")}
              placeholder="Fits a 5-speed stick"
              className={`${input} ${fieldFailed("name")}`}
            />
            {refusal("name")}
          </div>
          <div>
            <label htmlFor="new-v-slug" className={label}>
              Slug — required
            </label>
            <input
              id="new-v-slug"
              name="slug"
              required
              defaultValue={echo("slug")}
              placeholder="five-speed"
              className={`${input} ${fieldFailed("slug")} font-mono`}
            />
            {refusal("slug")}
            <p className="mt-1 text-[11px] text-fg-muted">
              <span className="font-mono">{slugify("Fits a 5-speed stick")}</span>
            </p>
          </div>
          <div>
            <label htmlFor="new-v-regular" className={label}>
              Regular — required
            </label>
            <input
              id="new-v-regular"
              name="regular"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("regular") || String(product.regular)}
              className={`${input} ${fieldFailed("regular")} font-mono`}
            />
            {refusal("regular")}
          </div>
          <div>
            <label htmlFor="new-v-premium" className={label}>
              Premium — required
            </label>
            <input
              id="new-v-premium"
              name="premium"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("premium") || String(product.premium)}
              className={`${input} ${fieldFailed("premium")} font-mono`}
            />
            {refusal("premium")}
          </div>
          <div>
            <label htmlFor="new-v-stock" className={label}>
              Stock
            </label>
            <select
              id="new-v-stock"
              name="stockState"
              defaultValue={echo("stockState") || "made_to_order"}
              className={`${input} ${fieldFailed("stockState")}`}
            >
              {STOCK_STATES.map((state) => (
                <option key={state} value={state}>
                  {state.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {refusal("stockState")}
          </div>
          <div className="sm:col-span-6">
            <button
              type="submit"
              className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
            >
              Add variation
            </button>
          </div>
        </form>
      </section>

      {/* ── Bundle ─────────────────────────────────────────────────────── */}
      <BundleEditor product={product} candidates={candidates} failures={failures} echo={echo} />

      {/* ── Danger ───────────────────────────────────────────────────────── */}
      <section className="mt-12 border-t border-border pt-6">
        <h3 className="font-display text-base font-semibold text-[#FF6B35]">
          Archive or delete this product
        </h3>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
          {product._count.layoutVariants > 0
            ? `Refused: this product is cut for ${product._count.layoutVariants} floor pan${
                product._count.layoutVariants === 1 ? "" : "s"
              }, so deleting it would remove a fit claim. Retire the floor pan or mark the offer out of stock instead — both leave the record readable.`
            : product._count.orderItems > 0
              ? `Refused: ${product._count.orderItems} order line${
                  product._count.orderItems === 1 ? "" : "s"
                } reference it. A sold product cannot vanish.`
              : "Nothing is sold or cut for this product, so deleting it removes only itself."}
        </p>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
          Archiving is the reversible answer: it takes the product off the shop and keeps
          everything — orders, prices and fitment — so it can be put back whenever you like.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form method="post" action={deleteProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              disabled={product._count.layoutVariants > 0 || product._count.orderItems > 0}
              title={
                product._count.layoutVariants > 0 || product._count.orderItems > 0
                  ? "This product is referenced, so it cannot be deleted. Archive it instead."
                  : "Delete this product"
              }
              className="rounded-lg border border-[#FF6B35] px-4 py-2 text-sm text-[#FF6B35] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete product
            </button>
          </form>
          <form method="post" action={product.archivedAt ? unarchiveProduct : archiveProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              title={
                product.archivedAt
                  ? "Put this product back on the shop"
                  : "Take this product off the shop without deleting anything"
              }
              className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
            >
              {product.archivedAt ? "Put back on the shop" : "Archive instead"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
/**
 * THE BUNDLE EDITOR.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * A bundle used to be a single hand-priced product row with its contents written in a
 * prose `note`, which made it a bundle with exactly one possible composition: a
 * customer wanting single layer mats with covers had nothing to buy, and neither did one
 * wanting mats with a boot liner. It is also why it could not tie into the mats — a
 * literal price does not follow the things it is made of, so moving the double layer
 * mats from 68,000 to 75,000 left a bundle claiming to contain them and priced as though
 * it did not.
 *
 * So the bundle states its PARTS, and the price is worked out from them. The owner sets
 * which products are in it and by how much to discount the total; everything else on
 * this screen follows.
 *
 * ── WHY IT IS ONE FORM ──────────────────────────────────────────────────────
 *
 * The discount, the derive switch and a quantity box per part are all inside a single
 * `<form action={saveBundle}>`. A bundle is one fact to the person editing it, and
 * splitting it across three screens is how the price and the contents get out of step.
 * The two buttons that are NOT a save — "Add" and "Take out" — override `formAction`
 * on their own buttons, the same way the variation rows above do.
 *
 * ── WHY THE ARITHMETIC IS SHOWN RATHER THAN DESCRIBED ───────────────────────
 *
 * `deriveBundlePrices()` is imported and run HERE, so the operator sees the same
 * figure the save is about to write, computed by the same function. The alternative —
 * describing the rule in prose and asking the owner to trust it — is how a bundle ends
 * up priced at a number its contents do not justify.
 */
function BundleEditor({
  product,
  candidates,
  failures,
  echo,
}: {
  product: {
    id: string;
    regular: number;
    premium: number;
    threeRowSurcharge: number | null;
    _count: { orderItems: number };
    bundle: {
      discountKind: string;
      discountValue: number;
      derivePricing: boolean;
      items: Array<{
        id: string;
        qty: number;
        product: { name: string; regular: number; premium: number };
        variation: { name: string; regular: number; premium: number } | null;
      }>;
    } | null;
  };
  candidates: Array<{
    id: string;
    name: string;
    regular: number;
    premium: number;
    variations: Array<{ id: string; name: string; regular: number; premium: number }>;
  }>;
  failures: Map<string, string>;
  echo: (field: string) => string;
}) {
  const input =
    "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none";
  const label = "block text-xs uppercase tracking-widest text-accent-dim";
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
  const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

  const bundle = product.bundle;
  const parts = bundle?.items ?? [];

  /*
   * THE ARITHMETIC ON THIS SCREEN, FROM THE PARTS' OWN PRICES.
   *
   * The VARIATION's price when one is named, the product's otherwise — the same
   * resolution order `bundleParts()` uses in the action and `toBundle()` uses on the
   * storefront. That is why the prisma select above pulls both: a screen that summed the
   * product's list price while the action summed the variation's would show one figure
   * and write another, which is the exact class of bug the composition model exists to
   * remove.
   */
  const derived = deriveBundlePrices(
    parts.map((item) => ({
      qty: item.qty,
      regular: item.variation?.regular ?? item.product.regular,
      premium: item.variation?.premium ?? item.product.premium,
    })),
    bundle && (BUNDLE_DISCOUNT_KINDS as readonly string[]).includes(bundle.discountKind)
      ? (bundle.discountKind as (typeof BUNDLE_DISCOUNT_KINDS)[number])
      : "percent",
    bundle?.discountValue ?? 0,
  );

  return (
    <section className="mt-10">
      <h3 className="font-display text-base font-semibold">Bundle</h3>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
        A bundle is this product <em>made of other products</em>, sold as one thing and
        priced from them. Pick what is in it, set the discount, and the price below is
        worked out for you at both tiers. Unticking this makes it a single product again
        and the prices at the top of this page are what it sells at.
      </p>

      <form method="post" action={saveBundle} className="mt-4">
        <input type="hidden" name="productId" value={product.id} />

        <label className="flex items-start gap-3 text-sm text-fg/80">
          <input
            type="checkbox"
            name="isBundle"
            defaultChecked={bundle !== null}
            className="mt-1 accent-gold"
          />
          <span>
            This product is a bundle
            <span className="block text-[11px] text-fg-muted">
              Everything below only applies while this is ticked.
            </span>
          </span>
        </label>

        {/* ── What is in it ─────────────────────────────────────────────── */}
        {parts.length > 0 && (
          <div className="mt-5">
            <p className={label}>What&apos;s in it</p>
            <ul className="mt-2 space-y-2">
              {parts.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg/85">
                      {item.variation ? `${item.product.name} — ${item.variation.name}` : item.product.name}
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      {item.variation ? "this option specifically" : "whichever option it has"}
                    </span>
                  </span>
                  <div className="w-24">
                    <label htmlFor={`qty__${item.id}`} className="text-[11px] text-fg-muted">
                      How many
                    </label>
                    <input
                      id={`qty__${item.id}`}
                      name={`qty__${item.id}`}
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={echo(`qty__${item.id}`) || String(item.qty)}
                      className={`${input} mt-0.5 font-mono`}
                    />
                  </div>
                  <button
                    type="submit"
                    formAction={removeBundleItem}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-fg hover:border-[#FF6B35] hover:text-[#FF6B35]"
                    title={`Take ${item.product.name} out of this bundle`}
                  >
                    Take out
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Add a part ────────────────────────────────────────────────── */}
        <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-4">
          <p className={label}>Add a part</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="partProductId" className="text-[11px] text-fg-muted">
                Product
              </label>
              <select
                id="partProductId"
                name="partProductId"
                required
                defaultValue=""
                className={`${input} mt-0.5 ${fieldFailed("partProductId")}`}
              >
                <option value="" disabled>
                  Choose a product…
                </option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {naira(candidate.regular)}
                  </option>
                ))}
              </select>
              {refusal("partProductId")}
            </div>
            <div>
              <label htmlFor="partVariationId" className="text-[11px] text-fg-muted">
                Which option (optional)
              </label>
              {/*
                ONE `<select>` FOR EVERY CANDIDATE'S OPTIONS, rather than a second select
                that changes with the first. It cannot: this console has no client
                component and no `useState`, so a dependent select would need JavaScript
                to exist at all. Leaving it blank is the common case and means "whichever
                option it has"; naming one is for the bundle that is specifically the
                beaded-edge mats.
              */}
              <select
                id="partVariationId"
                name="partVariationId"
                defaultValue={echo("partVariationId")}
                className={`${input} mt-0.5 ${fieldFailed("partVariationId")}`}
              >
                <option value="">Whichever option it has</option>
                {candidates.flatMap((candidate) =>
                  candidate.variations.map((variation) => (
                    <option key={variation.id} value={variation.id}>
                      {candidate.name} — {variation.name}
                    </option>
                  )),
                )}
              </select>
              {refusal("partVariationId")}
            </div>
            <div className="flex items-end gap-3">
              <div className="w-24">
                <label htmlFor="qty" className="text-[11px] text-fg-muted">
                  How many
                </label>
                <input
                  id="qty"
                  name="qty"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={echo("qty") || "1"}
                  className={`${input} mt-0.5 font-mono ${fieldFailed("qty")}`}
                />
              </div>
              <button
                type="submit"
                formAction={addBundleItem}
                className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
              >
                Add
              </button>
            </div>
          </div>
          {refusal("qty")}
          {refusal("partNotFound")}
          {refusal("bundleInBundle")}
          {refusal("bundleContainsItself")}
          {refusal("duplicateBundlePart")}
          {refusal("notABundle")}
        </div>

        {/* ── The discount, and the price it produces ───────────────────── */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discountKind" className={label}>
              Discount off the total
            </label>
            <select
              id="discountKind"
              name="discountKind"
              defaultValue={
                echo("discountKind") ||
                (bundle && (BUNDLE_DISCOUNT_KINDS as readonly string[]).includes(bundle.discountKind)
                  ? bundle.discountKind
                  : "percent")
              }
              className={input}
            >
              {BUNDLE_DISCOUNT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === "percent" ? "A percentage off" : "A fixed amount off (₦)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="discountValue" className={label}>
              How much
            </label>
            <input
              id="discountValue"
              name="discountValue"
              type="number"
              min={0}
              step="any"
              inputMode="numeric"
              defaultValue={echo("discountValue") || (bundle ? String(bundle.discountValue) : "0")}
              className={`${input} ${fieldFailed("discountValue")} font-mono`}
            />
            {refusal("discountValue")}
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-fg/80">
          <input
            type="checkbox"
            name="derivePricing"
            defaultChecked={bundle?.derivePricing ?? true}
            className="mt-1 accent-gold"
          />
          <span>
            Work the price out from the parts
            <span className="block text-[11px] text-fg-muted">
              Untick this and the two prices at the top of this page are what it sells at.
              The contents are still recorded either way, so the product page can still say
              what&apos;s inside.
            </span>
          </span>
        </label>

        {/*
          THE ARITHMETIC, SHOWN.

          When there are no parts yet this is all zeroes and the figure below is the
          floor, which is exactly what would be written — so the screen and the save
          agree even in the half-built state, rather than the screen showing ₦0 and the
          save writing something else.
        */}
        <div className="mt-5 rounded-xl border border-border bg-surface/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          {parts.length === 0 ? (
            <p>
              No parts yet, so there is nothing to price this from.
              {bundle?.derivePricing
                ? ` While the price is worked out from the parts, this sells at the floor — ${naira(MIN_BUNDLE_PRICE)} — until a part is added, and that is the figure the shop would quote.`
                : " The two prices at the top of this page are what it sells at."}{" "}
              Add a product above and the prices are worked out from it.
            </p>
          ) : (
            <>
              <p>
                The {parts.length} part{parts.length === 1 ? "" : "s"} come to{" "}
                <span className="font-mono text-fg/85">
                  {naira(derived.listRegular)} regular
                </span>{" "}
                and{" "}
                <span className="font-mono text-fg/85">
                  {naira(derived.listPremium)} premium
                </span>
                , which is what a customer would pay buying them on their own.
              </p>
              <p className="mt-1.5">
                With the discount that is{" "}
                <span className="font-mono text-accent">{naira(derived.regular)}</span> and{" "}
                <span className="font-mono text-accent">{naira(derived.premium)}</span> —
                saving{" "}
                <span className="font-mono text-accent">
                  {naira(derived.savedRegular)} / {naira(derived.savedPremium)}
                </span>
                .
              </p>
              <p className="mt-1.5">
                This product currently sells at{" "}
                <span className="font-mono text-fg/85">
                  {naira(product.regular)} regular / {naira(product.premium)} premium
                </span>
                {bundle?.derivePricing ? "." : " — untick the box above to make that the price."}
                {bundle?.derivePricing &&
                  (product.regular !== derived.regular || product.premium !== derived.premium) &&
                  " Saving below will bring it in line with the parts."}
              </p>
            </>
          )}
        </div>

        <div className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
          >
            Save bundle
          </button>
        </div>

        {/* Requirement 5.2: an explicit, named way to remove the bundle, with the
            consequence stated. It submits `removeBundle` rather than saveBundle, so it
            deletes the definition and the product stays — which is what unticking the
            box above also does, only now it is a thing the operator can name. */}
        {bundle && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="max-w-prose text-xs leading-relaxed text-fg-muted">
              <span className="font-semibold text-fg/80">Remove this bundle.</span> The bundle
              definition and everything inside it are deleted, and the product stays on the shop
              as a single item — selling at the two prices at the top of this page. Unlike
              unticking the box above, this is refused while any order names the product, because
              the composition is what explains that order.
            </p>
            <button
              type="submit"
              formAction={removeBundle}
              disabled={product._count.orderItems > 0}
              title={
                product._count.orderItems > 0
                  ? "This product has been sold as a bundle. Its composition is kept so the order stays readable."
                  : "Delete the bundle definition; the product stays on the shop"
              }
              className="mt-3 rounded-lg border border-[#FF6B35] px-4 py-2 text-sm text-[#FF6B35] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove this bundle
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
