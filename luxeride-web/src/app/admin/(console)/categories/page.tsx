import Link from "next/link";

import { prisma } from "@/lib/db";
import EmptyState from "@/components/admin/EmptyState";
import PageHeader from "@/components/admin/PageHeader";
import {
  BTN_DANGER,
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  FIELD_ERROR,
  INPUT,
  LABEL,
  SECTION_HINT,
  SECTION_TITLE,
  inputState,
} from "@/components/admin/ui";
import {
  createCategory,
  deleteCategory,
  deleteCategoryAndProducts,
  moveCategoryProducts,
  updateCategory,
} from "../catalogue-actions";
import { messageFor, readEcho, readFailures, slugify } from "../catalogue-guard";
import SubmitButton from "@/components/admin/SubmitButton";

/**
 * `/admin/categories` — the shop's top level, created and managed here.
 *
 * WHY THIS SCREEN EXISTS
 *
 * Until 2026-10-04 the five shop categories were a TypeScript array in
 * `src/data/products.ts`. Adding "Gear Covers" or "Accessories" meant a code
 * change, a redeploy and an edit to `PRODUCTS`, and there was no place to see the
 * shop's shape without reading a source file. The owner's requirement was "other
 * categories definitely need a place to be created and managed".
 *
 * WHY A CATEGORY CANNOT BE DELETED WHILE IT HOLDS PRODUCTS
 *
 * `Product.categoryId` is `onDelete: Cascade`, so the database would remove every
 * product in the category and take their PDPs off the shop with it, leaving no
 * record that anything had been there. `deleteCategory` refuses instead and names
 * the count. A cascade that silently deletes a live page is a worse outcome than
 * an extra step.
 *
 * NO `'use client'`, like every screen in this console. The server is the only
 * implementation of these rules, so a refusal renders identically with and without
 * JavaScript.
 */

/**
 * `force-dynamic` because this screen reads Postgres, and reading a database is
 * not a dynamic API as far as Next is concerned. Without it the page is
 * prerendered at build time and the console shows a build-day snapshot of the
 * catalogue — which is the same defect `next build` caught on `/admin` and
 * `/admin/demand`, and the same fix. See master-build-plan M9.3.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const failures = readFailures(query);
  const echo = readEcho(query);

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

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

  return (
    <div>
      <PageHeader
        title="Categories"
        meta={
          <>
            The top level of the shop. Each one is a real page at{" "}
            <code className="font-mono text-accent-dim">/shop/&lt;slug&gt;</code>, and a category
            holding products cannot be deleted.
          </>
        }
        actions={
          <a href="#add-category" className={BTN_SECONDARY}>
            Add a category
          </a>
        }
      />

      {/* ── Existing categories ───────────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className={SECTION_TITLE}>
          In the shop{" "}
          <span className="font-mono text-xs text-accent-dim">{categories.length}</span>
        </h3>

        {categories.length === 0 ? (
          <EmptyState className="mt-4">
            No categories yet. The shop has nothing to list until one exists below.
          </EmptyState>
        ) : (
          <ul className="mt-4 space-y-4">
            {categories.map((category) => (
              <li key={category.id} className={`${CARD} px-4 py-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-sm text-fg/80">
                    {category.name}
                    <span className="ml-2 font-mono text-[11px] text-accent-dim">
                      /shop/{category.slug}
                    </span>
                    <span className="ml-2 font-mono text-[11px] uppercase text-fg-muted">
                      {category._count.products} product{category._count.products === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Link
                    href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
                    className={BTN_GHOST}
                  >
                    Products in this category →
                  </Link>
                </div>

                <form method="post" action={updateCategory} className="mt-4 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={category.id} />
                  {/* Field names are scoped to this row. `/admin/categories` renders
                      one form per category and a refusal returns every typed value in
                      the query string, so unscoped names would write one form's name
                      into all of them on the way back. */}
                  <div className="sm:col-span-2">
                    <label htmlFor={`name__${category.id}`} className={LABEL}>
                      Name
                    </label>
                    <input
                      id={`name__${category.id}`}
                      name={`name__${category.id}`}
                      defaultValue={echo(`name__${category.id}`) || category.name}
                      className={`${INPUT} ${inputState(failures.has(`name__${category.id}`))}`}
                    />
                    {refusal(`name__${category.id}`)}
                  </div>
                  <div>
                    <label htmlFor={`slug__${category.id}`} className={LABEL}>
                      Slug
                    </label>
                    <input
                      id={`slug__${category.id}`}
                      name={`slug__${category.id}`}
                      defaultValue={echo(`slug__${category.id}`) || category.slug}
                      className={`${INPUT} font-mono`}
                    />
                    {refusal(`slug__${category.id}`)}
                  </div>
                  <div className="flex items-end">
                    <SubmitButton className={BTN_SECONDARY}>
                      Save
                    </SubmitButton>
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`blurb__${category.id}`} className={LABEL}>
                      One line under the heading
                    </label>
                    <input
                      id={`blurb__${category.id}`}
                      name={`blurb__${category.id}`}
                      defaultValue={echo(`blurb__${category.id}`) || (category.blurb ?? "")}
                      className={INPUT}
                    />
                  </div>
                  <div className="flex items-end">
                    <SubmitButton
                      formAction={deleteCategory}
                      disabled={category._count.products > 0}
                      title={
                        category._count.products > 0
                          ? "This category still holds products. Move or delete them first."
                          : "Delete this category"
                      }
                      className={BTN_DANGER}
                    >
                      Delete
                    </SubmitButton>
                  </div>
                </form>

                {/* ── Removing a category that still holds products ───────────────
                    Requirement 3.3: the two honest choices, move first. The plain
                    Delete above stays disabled (its own title says why), so this is the
                    only way out of a non-empty category and the two choices are
                    deliberately unequal — a move is one press, deleting the products
                    along with the category is behind a disclosure. */}
                {category._count.products > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs leading-relaxed text-fg-muted">
                      This category holds {category._count.products} product
                      {category._count.products === 1 ? "" : "s"}, so it cannot be deleted on
                      its own. Move them to another category, or delete them along with it.
                    </p>

                    <form
                      method="post"
                      action={moveCategoryProducts}
                      className="mt-3 flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="id" value={category.id} />
                      <div>
                        <label htmlFor={`toCategoryId__${category.id}`} className={LABEL}>
                          Move products to — the safe choice
                        </label>
                        <select
                          id={`toCategoryId__${category.id}`}
                          name="toCategoryId"
                          defaultValue={echo("toCategoryId")}
                          className={`${INPUT} ${inputState(failures.has("toCategoryId"))}`}
                        >
                          <option value="">Choose a category…</option>
                          {categories
                            .filter((other) => other.id !== category.id)
                            .map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name}
                              </option>
                            ))}
                        </select>
                        {refusal("toCategoryId")}
                      </div>
                      <SubmitButton className={BTN_SECONDARY}>
                        Move {category._count.products} product
                        {category._count.products === 1 ? "" : "s"}
                      </SubmitButton>
                    </form>

                    <details className="mt-3 rounded-lg border border-danger/40 px-4 py-3">
                      <summary className="cursor-pointer text-xs text-danger">
                        Or delete the {category._count.products} product
                        {category._count.products === 1 ? "" : "s"} as well
                      </summary>
                      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                        This removes the products and the category in one step. A product that
                        has been sold or is cut for a car is refused, so this never takes a
                        live page with it silently.
                      </p>
                      <form method="post" action={deleteCategoryAndProducts} className="mt-2">
                        <input type="hidden" name="id" value={category.id} />
                        <SubmitButton
                          className={BTN_DANGER}
                        >
                          Delete this category and its {category._count.products} product
                          {category._count.products === 1 ? "" : "s"}
                        </SubmitButton>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Add one ──────────────────────────────────────────────────────── */}
      <section id="add-category" className="mt-10">
        <h3 className={SECTION_TITLE}>Add a category</h3>
        <p className={SECTION_HINT}>
          For anything that is not cut to a specific floor pan — gear covers, accessories, sun
          shades — create the category here first, then add products under it. Nothing on this form
          is invented for you: the slug is yours to write and it becomes the URL.
        </p>

        <form method="post" action={createCategory} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="new-name" className={LABEL}>
              Name — required
            </label>
            <input
              id="new-name"
              name="name"
              required
              defaultValue={echo("name")}
              placeholder="Gear Covers"
              className={`${INPUT} ${inputState(failures.has("name"))}`}
            />
            {refusal("name")}
          </div>
          <div>
            <label htmlFor="new-slug" className={LABEL}>
              Slug — required, becomes the URL
            </label>
            <input
              id="new-slug"
              name="slug"
              required
              defaultValue={echo("slug")}
              placeholder="gear-covers"
              className={`${INPUT} ${inputState(failures.has("slug"))} font-mono`}
            />
            {refusal("slug")}
            <p className="mt-1 text-[11px] text-fg-muted">
              Lowercase, numbers, dashes. Leave it blank and Next will not guess for you —{" "}
              <span className="font-mono text-accent-dim">{slugify("Gear Covers")}</span> is what it
              would become.
            </p>
          </div>
          <div>
            <label htmlFor="new-blurb" className={LABEL}>
              One line under the heading
            </label>
            <input id="new-blurb" name="blurb" defaultValue={echo("blurb")} className={INPUT} />
          </div>
          <div className="sm:col-span-3">
            <SubmitButton className={BTN_PRIMARY}>
              Create category
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}