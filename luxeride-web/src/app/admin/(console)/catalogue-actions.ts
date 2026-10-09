"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { flashBack } from "./flash";
import { requireAdmin } from "@/lib/admin-auth";
import {
  deriveBundlePrices,
  isBundleDiscountKind,
  validateBundleDiscount,
} from "@/lib/bundle-price.ts";

import {
  bundleRemoval,
  categoryRemoval,
  productRemoval,
  validateCategory,
  validateCategoryMove,
  validateProduct,
  validateVariation,
  variationRemoval,
  type Failure,
  type RowReferences,
} from "./catalogue-guard.ts";

/**
 * Every catalogue mutation: categories, products and their variations.
 *
 * WHY THIS IS A SECOND `'use server'` MODULE AND NOT PART OF `actions.ts`
 *
 * `actions.ts` is the FITMENT console and `catalog-guard.ts` is the shop's CRUD
 * vocabulary; the two share a failure-code table (see the header of that file) and
 * nothing else. They change for different reasons — one is the evidence gate, the
 * other is ordinary shop admin — and `actions.ts` was already 900 lines before
 * this. The shared helpers below (`text`, `pick`, `submittedValues`, `backTo`,
 * `refusalParams`, `audit`, `todayIso`) are duplicated rather than extracted,
 * because a module carrying `'use server'` may only export async functions, so
 * there is nowhere to put a shared non-async helper that both can import without
 * making it a Server Action itself. That constraint is stated here rather than
 * worked around silently.
 *
 * WHY `requireAdmin()` IS THE FIRST STATEMENT OF EVERY FUNCTION
 *
 * The same reasoning as `actions.ts`, and the same guarantee: a Server Action is a
 * POST endpoint reachable by anyone who can send the same POST, so a button that
 * only renders for an authenticated operator is a UI convenience and not a
 * boundary. `requireAdmin()` throws, so writing `await requireAdmin()` and ignoring
 * the result cannot be done by accident.
 *
 * THE REVALIDATION SET, AND WHY IT IS SHORTER THAN THE DATABASE
 *
 * Every function calls `revalidatePath` on the admin screen AND on the storefront
 * surfaces that read the catalogue. The storefront is in the next pass of this
 * work — `src/lib/catalogue.ts` does not exist yet — so the paths named here are
 * the ones that will read these rows. Naming them now means a catalogue change is
 * never silently cached: the `dynamic = "force-dynamic"` on the admin pages and
 * `revalidateTag` on the shop come from the store pass, and this is the half that
 * cannot be added afterwards.
 */

const ACTION_REQUEST_URL = "https://luxeride.local/admin";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Every string field, keyed by `name`, for the refusal round trip. */
function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

function pick(values: Record<string, string>, name: string): string {
  return values[name] ?? "";
}

/**
 * Read a field from a form that is scoped to one row.
 *
 * WHY THIS EXISTS RATHER THAN ONE `name="name"` PER FORM
 *
 * `/admin/categories` renders one edit form PER category, and a refusal comes back
 * as a redirect whose query string carries every typed value. With unscoped names,
 * `v.name` is the name typed into whichever form was refused, and it gets written
 * into all of them on the way back — so a refusal on the third category silently
 * renamed the first two. Prefixing each field with its row id is what keeps a
 * refusal attached to the form that caused it.
 *
 * Falls back to the bare name so the single-form "add" path — which has no row yet
 * — keeps one code path rather than two.
 */
function pickScoped(values: Record<string, string>, base: string, id: string): string {
  const scoped = values[`${base}__${id}`];
  return scoped ?? values[base] ?? "";
}

/**
 * The refusal round trip.
 *
 * WHY THE TYPED VALUES TRAVEL IN THE URL
 *
 * A refused submission comes back to this page as a redirect, and the form
 * re-renders from `v.<fieldName>`. So a half-typed note survives instead of being
 * silently discarded — which is what makes the refusal cheap to fix, and is also
 * why the free-text fields have a length cap (a note that genuinely needs more
 * than 500 characters needs a form that keeps its own state, not a longer URL).
 */
function refusalParams(values: Record<string, string>, failures: Failure[]): URLSearchParams {
  const params = new URLSearchParams();
  params.set("e", failures.map((failure) => `${failure.field}~${failure.code}`).join(","));
  for (const [field, value] of Object.entries(values)) {
    if (field === "layoutId") continue;
    if (value.length > 0 && value.length <= 500) params.set(`v.${field}`, value);
  }
  return params;
}

function backTo(path: string, params: URLSearchParams): never {
  redirect(`${path}?${params.toString()}`);
}

async function audit(entry: {
  entity: string;
  entityId: string;
  action: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}): Promise<void> {
  await prisma.auditEntry.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      field: entry.field ?? null,
      before: entry.before === undefined ? undefined : (entry.before as never),
      after: entry.after === undefined ? undefined : (entry.after as never),
      note: entry.note ?? null,
      who: process.env.ADMIN_USER ?? null,
    },
  });
}

/**
 * WHAT REFERENCES A PRODUCT RIGHT NOW, counted before anything is removed.
 *
 * Orders first because they are the reference a hard delete cannot undo; the
 * floor-pan offers next because deleting the product would take a live fit claim with
 * it. Both come from one read, so the refusal, the report on the screen and the
 * delete's own guard cannot disagree about the same row.
 *
 * Returns null when the product is gone, which is its own answer (`productNotFound`).
 */
async function productReferences(productId: string): Promise<RowReferences | null> {
  const row = await prisma.product.findUnique({
    where: { id: productId },
    select: { _count: { select: { orderItems: true, layoutVariants: true } } },
  });
  if (!row) return null;
  return { orderItems: row._count.orderItems, layoutVariants: row._count.layoutVariants };
}

/** The storefront paths a catalogue change has to reach. */
function revalidateCatalogue(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/products");
  revalidatePath("/fit-finder");
  revalidatePath("/sitemap.xml");
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const existing = (await prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug);

  const check = validateCategory(
    { name: pick(values, "name"), slug: pick(values, "slug"), blurb: pick(values, "blurb") },
    existing,
  );
  if (!check.ok) backTo("/admin/categories", refusalParams(values, check.failures));

  const created = await prisma.category.create({ data: check.value });
  await audit({
    entity: "Category",
    entityId: created.id,
    action: "create",
    after: { slug: created.slug, name: created.name },
    note: `category ${created.slug} created`,
  });

  revalidateCatalogue();
  await flashBack("/admin/categories", "category");
}

export async function updateCategory(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/categories";

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  // The row's OWN slug is excluded, so re-saving an unchanged form is not refused
  // for colliding with itself. This is the whole reason `taken` is passed in rather
  // than looked up inside the validator.
  const taken = (await prisma.category.findMany({ select: { slug: true } }))
    .map((c) => c.slug)
    .filter((slug) => slug !== category.slug);

  const check = validateCategory(
    {
      name: pickScoped(values, "name", id),
      slug: pickScoped(values, "slug", id),
      blurb: pickScoped(values, "blurb", id),
    },
    taken,
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const changed =
    category.name !== check.value.name ||
    category.slug !== check.value.slug ||
    (category.blurb ?? "") !== check.value.blurb;

  if (changed) {
    await prisma.category.update({ where: { id }, data: check.value });
    await audit({
      entity: "Category",
      entityId: id,
      action: "update",
      before: { slug: category.slug, name: category.name, blurb: category.blurb },
      after: check.value,
      note: `category ${check.value.slug} updated`,
    });
    revalidateCatalogue();
  }

  await flashBack(back, changed ? "category" : "unchanged");
}

/**
 * Delete a category — REFUSED while it holds products.
 *
 * `Product.categoryId` is `onDelete: Cascade`, so the database would happily take
 * every product in the category with it and leave the shop with fewer pages and no
 * record that anything was removed. The refusal is here instead, naming the count,
 * because a silent cascade is how a category disappears and takes a live PDP with
 * it. Move or delete the products first.
 */
export async function deleteCategory(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/categories";

  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  const blocked = categoryRemoval(category._count.products);
  if (blocked) backTo(back, refusalParams(values, [blocked]));

  await prisma.category.delete({ where: { id } });
  await audit({
    entity: "Category",
    entityId: id,
    action: "delete",
    before: { slug: category.slug, name: category.name },
    note: `category ${category.slug} deleted (it was empty)`,
  });

  revalidateCatalogue();
  await flashBack(back, "categoryDeleted");
}

/**
 * Empty a category by moving its products to another one — the DEFAULT of the two
 * honest choices Requirement 3.3 offers.
 *
 * A move only. The category is left in place and empty, and the now-enabled Delete
 * button removes it, which is exactly what the disabled button's own title promises
 * ("Move or delete them first"). Doing the delete here as well would make one press
 * do two things and take the operator past the step where they can see the shop is
 * correct with the products simply re-homed.
 */
export async function moveCategoryProducts(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/categories";

  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  // Nothing to move. A no-op rather than a refusal, because the two actions that can
  // reach here (the form, or a hand-written POST) both mean "move the products", and
  // there are none.
  if (category._count.products === 0) {
    await flashBack(back, "unchanged");
    return;
  }

  const targets = await prisma.category.findMany({ select: { id: true } });
  const move = validateCategoryMove(
    { fromId: id, toId: pick(values, "toCategoryId") },
    targets.map((target) => target.id),
  );
  if (!move.ok) backTo(back, refusalParams(values, [move.failure]));

  const moved = await prisma.product.updateMany({
    where: { categoryId: id },
    data: { categoryId: move.toId },
  });
  await audit({
    entity: "Category",
    entityId: id,
    action: "update",
    field: "products moved",
    before: { category: category.slug, products: moved.count },
    after: { toCategoryId: move.toId },
    note: `moved ${moved.count} product${moved.count === 1 ? "" : "s"} out of ${category.slug}`,
  });

  revalidateCatalogue();
  await flashBack(back, "categoryProductsMoved");
}

/**
 * The second, more deliberate choice: delete the category AND every product in it.
 *
 * Kept separate from the move above so the destructive one is never the default, and
 * guarded on the products' own references first: `LayoutVariant` and `BundleItem` are
 * `Restrict`, so a product cut for a car cannot be deleted at all, and a P2003 is not
 * an explanation. A category holding anything that cannot be deleted is refused whole
 * rather than half-emptied — a hidden cascade that takes a live PDP with it is exactly
 * what Requirement 3.3 exists to prevent.
 */
export async function deleteCategoryAndProducts(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/categories";

  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      products: {
        select: {
          id: true,
          slug: true,
          _count: { select: { orderItems: true, layoutVariants: true, partOf: true } },
        },
      },
    },
  });
  if (!category) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  if (category.products.length === 0) {
    await flashBack(back, "unchanged");
    return;
  }

  // `partOf` as well as the two the report names: a product that is a part of another
  // bundle is `Restrict` too, so deleting it would fail. Refusing on it here keeps the
  // transaction from throwing halfway through a category.
  let blocked: Failure | null = productRemoval({
    orderItems: category.products.reduce((sum, p) => sum + p._count.orderItems, 0),
    layoutVariants: category.products.reduce((sum, p) => sum + p._count.layoutVariants, 0),
  });
  if (!blocked && category.products.some((p) => p._count.partOf > 0)) {
    blocked = { field: "name", code: "productInUse" };
  }
  if (blocked) backTo(back, refusalParams(values, [blocked]));

  await prisma.$transaction(async (tx) => {
    // A cascade would take the variations and any bundle definition with each product;
    // the explicit deletes and the single audit row keep the removal legible.
    await tx.product.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
    await tx.auditEntry.create({
      data: {
        entity: "Category",
        entityId: id,
        action: "delete",
        before: { slug: category.slug, name: category.name, products: category.products.map((p) => p.slug) } as never,
        note: `category ${category.slug} deleted with its ${category.products.length} product${category.products.length === 1 ? "" : "s"}`,
        who: process.env.ADMIN_USER ?? null,
      },
    });
  });

  revalidateCatalogue();
  await flashBack(back, "categoryProductsDeleted");
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function createProduct(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const back = "/admin/products";

  const [existing, categories] = await Promise.all([
    prisma.product.findMany({ select: { slug: true } }),
    // `id` as well as `slug`: the form submits the slug a human recognises, and the
    // column is a foreign key, so the row is resolved from one to the other here
    // rather than trusting a slug off the wire as if it were an id.
    prisma.category.findMany({ select: { id: true, slug: true } }),
  ]);
  const categorySlugs = categories.map((c) => c.slug);

  const check = validateProduct(
    {
      name: pick(values, "name"),
      slug: pick(values, "slug"),
      categorySlug: pick(values, "categorySlug"),
      note: pick(values, "note"),
      availability: pick(values, "availability"),
      regular: pick(values, "regular"),
      premium: pick(values, "premium"),
      rowApplicable: text(formData, "rowApplicable") === "on",
      threeRowSurcharge: pick(values, "threeRowSurcharge"),
      isCarSpecific: text(formData, "isCarSpecific") === "on",
    },
    existing.map((p) => p.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  if (!categorySlugs.includes(check.value.categorySlug)) {
    backTo(back, refusalParams(values, [{ field: "categorySlug", code: "required" }]));
  }

  const category = categories.find((c) => c.slug === check.value.categorySlug)!;

  const created = await prisma.product.create({
    data: {
      name: check.value.name,
      slug: check.value.slug,
      categoryId: category.id,
      note: check.value.note.trim() || null,
      availability: check.value.availability.trim() || null,
      regular: Number(check.value.regular),
      premium: Number(check.value.premium),
      rowApplicable: check.value.rowApplicable,
      threeRowSurcharge: check.value.rowApplicable && check.value.threeRowSurcharge !== ""
        ? Number(check.value.threeRowSurcharge)
        : null,
      images: [],
      isCarSpecific: check.value.isCarSpecific,
    },
  });

  /**
   * THE FIRST VARIATION, CREATED WITH THE PRODUCT.
   *
   * Not a convenience. `Product` with no `ProductVariation` has nothing to sell:
   * the storefront prices a variation, and the Fit Finder's per-range price hangs
   * off a `LayoutVariant` that points at one. A product saved with no variation is
   * a product that exists in the admin and cannot appear on the shop, which is
   * exactly the kind of half-made state this console exists to prevent.
   *
   * It copies the product's own prices, so a one-variation product prices
   * identically to how the same product priced before this table existed.
   */
  await prisma.productVariation.create({
    data: {
      productId: created.id,
      slug: "standard",
      name: `${created.name} — Standard`,
      regular: created.regular,
      premium: created.premium,
      rowApplicable: created.rowApplicable,
      threeRowSurcharge: created.threeRowSurcharge,
      sortOrder: 0,
    },
  });

  await audit({
    entity: "Product",
    entityId: created.id,
    action: "create",
    after: {
      slug: created.slug,
      name: created.name,
      regular: created.regular,
      premium: created.premium,
      isCarSpecific: created.isCarSpecific,
    },
    note: `product ${created.slug} created in ${category.slug} with one variation`,
  });

  revalidateCatalogue();
  revalidatePath(`/admin/products/${created.id}`);
  await flashBack(back, "product");
}

export async function updateProduct(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = `/admin/products/${encodeURIComponent(id)}`;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, slug: true } }, bundle: { select: { derivePricing: true } } },
  });
  if (!product) backTo("/admin/products", refusalParams(values, [{ field: "name", code: "required" }]));

  /*
   * A BUNDLE'S PRICE IS NOT TYPED ON THIS FORM.
   *
   * The bundle editor further down the same page works the price out from the parts. If
   * this form could also set it, there would be two inputs for one number and the
   * easier one to reach would win — which is how a bundle ends up selling at a figure its
   * contents do not justify, the exact defect the composition model exists to remove.
   *
   * REFUSED RATHER THAN IGNORED. A form that silently discards what you typed is a form
   * you stop trusting, and the operator would have no way to tell a save that worked
   * from one that did not.
   *
   * Only a price that actually DIFFERS is refused. Saving the rest of the product — a
   * name, a note, the 3-row surcharge — is not blocked, because the bundle editor and
   * the product editor are two sections of one page and both get used.
   */
  const derived = product.bundle?.derivePricing === true;
  if (derived) {
    const typedRegular = Number(pick(values, "regular"));
    const typedPremium = Number(pick(values, "premium"));
    if (Number.isFinite(typedRegular) && typedRegular !== product.regular) {
      backTo(back, refusalParams(values, [{ field: "regular", code: "bundlePriceIsDerived" }]));
    }
    if (Number.isFinite(typedPremium) && typedPremium !== product.premium) {
      backTo(back, refusalParams(values, [{ field: "premium", code: "bundlePriceIsDerived" }]));
    }
  }

  const [taken, categories] = await Promise.all([
    prisma.product.findMany({ select: { slug: true } }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
  ]);

  const check = validateProduct(
    {
      name: pick(values, "name"),
      slug: pick(values, "slug"),
      categorySlug: pick(values, "categorySlug"),
      note: pick(values, "note"),
      availability: pick(values, "availability"),
      regular: pick(values, "regular"),
      premium: pick(values, "premium"),
      rowApplicable: text(formData, "rowApplicable") === "on",
      threeRowSurcharge: pick(values, "threeRowSurcharge"),
      isCarSpecific: text(formData, "isCarSpecific") === "on",
    },
    taken.map((p) => p.slug).filter((slug) => slug !== product.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const category = categories.find((c) => c.slug === check.value.categorySlug);
  if (!category) backTo(back, refusalParams(values, [{ field: "categorySlug", code: "required" }]));

  const nextRegular = Number(check.value.regular);
  const nextPremium = Number(check.value.premium);
  const nextSurcharge =
    check.value.rowApplicable && check.value.threeRowSurcharge !== ""
      ? Number(check.value.threeRowSurcharge)
      : null;

  const changed =
    product.name !== check.value.name ||
    product.slug !== check.value.slug ||
    product.categoryId !== category.id ||
    (product.note ?? "") !== check.value.note.trim() ||
    (product.availability ?? "") !== check.value.availability.trim() ||
    (!derived && product.regular !== nextRegular) ||
    (!derived && product.premium !== nextPremium) ||
    product.rowApplicable !== check.value.rowApplicable ||
    (product.threeRowSurcharge ?? null) !== nextSurcharge ||
    product.isCarSpecific !== check.value.isCarSpecific;

  if (changed) {
    await prisma.product.update({
      where: { id },
      data: {
        name: check.value.name,
        slug: check.value.slug,
        categoryId: category.id,
        note: check.value.note.trim() || null,
        availability: check.value.availability.trim() || null,
        // On a derived-price bundle these are the values already on the row: the refusal
        // above has proved the typed ones equal to them.
        regular: derived ? product.regular : nextRegular,
        premium: derived ? product.premium : nextPremium,
        rowApplicable: check.value.rowApplicable,
        threeRowSurcharge: nextSurcharge,
        isCarSpecific: check.value.isCarSpecific,
      },
    });
    await audit({
      entity: "Product",
      entityId: id,
      action: "update",
      before: {
        slug: product.slug,
        name: product.name,
        regular: product.regular,
        premium: product.premium,
        isCarSpecific: product.isCarSpecific,
      },
      after: {
        slug: check.value.slug,
        name: check.value.name,
        // What was ACTUALLY written, which for a derived-price bundle is not what was
        // typed. An audit row recording a number nobody stored is the one kind of lie
        // this table cannot contain.
        regular: derived ? product.regular : nextRegular,
        premium: derived ? product.premium : nextPremium,
        isCarSpecific: check.value.isCarSpecific,
      },
      note: `product ${check.value.slug} updated`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, changed ? "product" : "unchanged");
}

/**
 * Delete a product — REFUSED while any floor pan offers it.
 *
 * `LayoutVariant.productId` is `Restrict`, so the database would raise P2003, and a
 * P2003 shown to an operator is not an explanation. A product that is cut for a
 * car is a fit claim: the honest way to stop selling it is to retire the floor pan
 * or mark the offer out of stock, both of which leave the record readable. This
 * refusal says so.
 */
export async function deleteProduct(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/products";

  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { layoutVariants: true, orderItems: true } } },
  });
  if (!product) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  // The hard stop, named. `productRemoval` says WHICH reference is holding the row,
  // so the refusal reads "orderItems" or "layoutVariants" rather than a shrug.
  const blocked = productRemoval(product._count);
  if (blocked) backTo(back, refusalParams(values, [blocked]));

  // No floor pan and no order references it, so the cascade to its variations is
  // safe and nothing else is touched.
  await prisma.product.delete({ where: { id } });
  await audit({
    entity: "Product",
    entityId: id,
    action: "delete",
    before: { slug: product.slug, name: product.name },
    note: `product ${product.slug} deleted`,
  });

  revalidateCatalogue();
  await flashBack(back, "productDeleted");
}

/**
 * Archive a product: off the shop, kept for the orders it was sold on.
 *
 * The reversible answer to `deleteProduct`'s refusal (Requirement 4.5). Nothing is
 * deleted and no price moves — `archivedAt` is set, and every storefront read in
 * `src/lib/catalogue.ts` drops `archivedAt: null` rows, so `/shop`, the PDP, the
 * related-products strip and the sitemap all stop showing it while its order lines
 * and pricing history stay exactly as they were. Unarchive clears the timestamp.
 */
export async function archiveProduct(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = `/admin/products/${encodeURIComponent(id)}`;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, slug: true, archivedAt: true },
  });
  if (!product) backTo("/admin/products", refusalParams(values, [{ field: "name", code: "productNotFound" }]));

  if (!product.archivedAt) {
    const now = new Date();
    await prisma.product.update({ where: { id }, data: { archivedAt: now } });
    await audit({
      entity: "Product",
      entityId: id,
      action: "archive",
      before: { slug: product.slug, archivedAt: null },
      after: { slug: product.slug, archivedAt: now.toISOString() },
      note: `product ${product.slug} archived — off the shop, orders and prices kept`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, product.archivedAt ? "unchanged" : "productArchived");
}

/** Put an archived product back on the shop. The undo of `archiveProduct`. */
export async function unarchiveProduct(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = `/admin/products/${encodeURIComponent(id)}`;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, slug: true, archivedAt: true },
  });
  if (!product) backTo("/admin/products", refusalParams(values, [{ field: "name", code: "productNotFound" }]));

  if (product.archivedAt) {
    await prisma.product.update({ where: { id }, data: { archivedAt: null } });
    await audit({
      entity: "Product",
      entityId: id,
      action: "unarchive",
      before: { slug: product.slug, archivedAt: product.archivedAt.toISOString() },
      after: { slug: product.slug, archivedAt: null },
      note: `product ${product.slug} back on the shop`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, product.archivedAt ? "productUnarchived" : "unchanged");
}

// ─── Variations ──────────────────────────────────────────────────────────────

export async function createVariation(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variations: { select: { slug: true, sortOrder: true } } },
  });
  if (!product) backTo("/admin/products", refusalParams(values, [{ field: "name", code: "required" }]));

  const check = validateVariation(
    {
      name: pick(values, "name"),
      slug: pick(values, "slug"),
      regular: pick(values, "regular"),
      premium: pick(values, "premium"),
      stockState: pick(values, "stockState"),
      sku: pick(values, "sku"),
    },
    product.variations.map((v) => v.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  // New rows go to the end rather than renumbering the list. Ties in `sortOrder` are
  // broken by name, so the ordering is stable without a second write per row.
  const nextSort = Math.max(0, ...product.variations.map((v) => v.sortOrder)) + 1;

  const created = await prisma.productVariation.create({
    data: {
      productId,
      slug: check.value.slug,
      name: check.value.name,
      regular: Number(check.value.regular),
      premium: Number(check.value.premium),
      stockState: check.value.stockState,
      sku: check.value.sku.trim() || null,
      sortOrder: nextSort,
    },
  });

  await audit({
    entity: "ProductVariation",
    entityId: created.id,
    action: "create",
    after: { slug: created.slug, name: created.name, regular: created.regular, premium: created.premium },
    note: `variation added to ${product.slug}`,
  });

  revalidateCatalogue();
  revalidatePath(back);
  await flashBack(back, "variation");
}

/**
 * Update one variation's own price.
 *
 * WHY THIS DOES NOT REWRITE THE PRODUCT'S PRICES
 *
 * A variation is priced on its own row precisely so a product can carry more than
 * one. Copying a variation's price up onto the product would make the second
 * variation overwrite the first, which is the opposite of what this table is for.
 * The two agree today only because `createProduct` seeds the first variation from
 * the product; from here on they are allowed to drift, and that drift is the point.
 *
 * It also deliberately does NOT touch `RangePrice`. A floor pan's per-year price is
 * the owner's call on the car screen, where the years are visible; silently
 * re-pricing 200 confirmed cars from a shop edit is not a thing a shop edit should
 * be able to do.
 */
export async function updateVariation(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const variation = await prisma.productVariation.findUnique({
    where: { id },
    include: { product: { select: { slug: true, variations: { select: { slug: true } } } } },
  });
  if (!variation) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  const check = validateVariation(
    {
      name: pickScoped(values, "name", id),
      slug: pickScoped(values, "slug", id),
      regular: pickScoped(values, "regular", id),
      premium: pickScoped(values, "premium", id),
      stockState: pickScoped(values, "stockState", id),
      sku: pickScoped(values, "sku", id),
    },
    variation.product.variations.map((v) => v.slug).filter((slug) => slug !== variation.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const nextRegular = Number(check.value.regular);
  const nextPremium = Number(check.value.premium);
  const nextSku = check.value.sku.trim() || null;

  const changed =
    variation.name !== check.value.name ||
    variation.slug !== check.value.slug ||
    variation.regular !== nextRegular ||
    variation.premium !== nextPremium ||
    variation.stockState !== check.value.stockState ||
    (variation.sku ?? null) !== nextSku;

  if (changed) {
    await prisma.productVariation.update({
      where: { id },
      data: {
        name: check.value.name,
        slug: check.value.slug,
        regular: nextRegular,
        premium: nextPremium,
        stockState: check.value.stockState,
        sku: nextSku,
      },
    });
    await audit({
      entity: "ProductVariation",
      entityId: id,
      action: "update",
      field: "regular/premium",
      before: { regular: variation.regular, premium: variation.premium },
      after: { regular: nextRegular, premium: nextPremium },
      note: `variation on ${variation.product.slug}`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, changed ? "variation" : "unchanged");
}

/**
 * Delete a variation — REFUSED when it has been sold.
 *
 * `OrderItem.variationId` is `Restrict`, and an order line that pointed at nothing
 * would be a record of a purchase of an option that no longer exists. The refusal
 * names the stock state to use instead: "out of stock" keeps the history readable
 * and stops the sale, which is what a discontinued option actually is.
 */
export async function deleteVariation(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const variation = await prisma.productVariation.findUnique({
    where: { id },
    include: { _count: { select: { orderItems: true, layoutVariants: true } } },
  });
  if (!variation) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  // `OrderItem.variationId` and `LayoutVariant.variationId` are both `Restrict`, so the
  // database would raise P2003 rather than let an order line or a live offer point at
  // nothing. The rule is one function so the two references cannot drift apart.
  const blocked = variationRemoval(variation._count);
  if (blocked) backTo(back, refusalParams(values, [blocked]));

  await prisma.productVariation.delete({ where: { id } });
  await audit({
    entity: "ProductVariation",
    entityId: id,
    action: "delete",
    before: { slug: variation.slug, name: variation.name },
    note: "variation deleted",
  });

  revalidateCatalogue();
  revalidatePath(back);
  await flashBack(back, "variationDeleted");
}

/**
 * Archive a variation — a retired colourway or layer, kept for its order history.
 *
 * The reversible answer to `deleteVariation`'s refusal (Requirement 6.3): the option
 * stops being offered because `productSelect.variations` filters `archivedAt: null`,
 * while a sold order line that names it still resolves. Distinct from setting the
 * stock state to `out_of_stock`, which is the honesty sentence about a car and not a
 * lifecycle state.
 */
export async function archiveVariation(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const variation = await prisma.productVariation.findUnique({
    where: { id },
    select: { id: true, slug: true, productId: true, archivedAt: true },
  });
  if (!variation) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  if (!variation.archivedAt) {
    const now = new Date();
    await prisma.productVariation.update({ where: { id }, data: { archivedAt: now } });
    await audit({
      entity: "ProductVariation",
      entityId: id,
      action: "archive",
      before: { slug: variation.slug, archivedAt: null },
      after: { slug: variation.slug, archivedAt: now.toISOString() },
      note: `variation ${variation.slug} archived — off the product page, order history kept`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, variation.archivedAt ? "unchanged" : "variationArchived");
}

/** Put an archived variation back on the product. The undo of `archiveVariation`. */
export async function unarchiveVariation(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const variation = await prisma.productVariation.findUnique({
    where: { id },
    select: { id: true, slug: true, productId: true, archivedAt: true },
  });
  if (!variation) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  if (variation.archivedAt) {
    await prisma.productVariation.update({ where: { id }, data: { archivedAt: null } });
    await audit({
      entity: "ProductVariation",
      entityId: id,
      action: "unarchive",
      before: { slug: variation.slug, archivedAt: variation.archivedAt.toISOString() },
      after: { slug: variation.slug, archivedAt: null },
      note: `variation ${variation.slug} back on the product page`,
    });
    revalidateCatalogue();
    revalidatePath(back);
  }

  await flashBack(back, variation.archivedAt ? "variationUnarchived" : "unchanged");
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

/**
 * Load a bundle's parts with the two prices each contributes.
 *
 * The resolution order is THE VARIATION'S PRICE WHEN ONE IS NAMED, because
 * `ProductVariation` exists to carry a price: a bundle of "the beaded-edge double
 * layer" has to sum that price, or the sum is of a number nobody sells. With no
 * variation named it falls back to the product, which is correct for the common case of
 * a bundle part that has one option.
 *
 * Shared by all three actions below so that what the admin SHOWS and what the admin
 * SAVES are computed by the same read. Two copies of this is how a bundle ends up
 * priced from one resolution and displayed from another.
 */
async function bundleParts(bundleProductId: string) {
  const rows = await prisma.bundleItem.findMany({
    where: { bundleId: bundleProductId },
    select: {
      id: true,
      qty: true,
      sortOrder: true,
      product: { select: { slug: true, name: true, regular: true, premium: true } },
      variation: { select: { name: true, regular: true, premium: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    qty: row.qty,
    sortOrder: row.sortOrder,
    productSlug: row.product.slug,
    productName: row.product.name,
    name: row.variation?.name ?? row.product.name,
    regular: row.variation?.regular ?? row.product.regular,
    premium: row.variation?.premium ?? row.product.premium,
  }));
}

/**
 * Save the bundle's discount, and — when the bundle derives its price — its two prices.
 *
 * WHY THE PRICE IS WRITTEN ONTO THE PRODUCT
 *
 * `Product.regular`/`premium` are what every existing reader uses: the card's
 * `priceRange()`, the PDP's `formatPriceFrom()`, the cart, the order-pricing path and
 * the Fit Finder's fallback. Computing the bundle price at each of those sites would mean
 * six places that know what a bundle is, and the seventh one somebody adds later would
 * be the one that gets it wrong.
 *
 * So the derivation happens ONCE, here, and lands in the columns everything else
 * already reads. `deriveBundlePrices()` in `src/lib/bundle-price.ts` is the only
 * function that knows the rule; this action is the only thing that writes the result.
 *
 * THE PRICE IS RECOMPUTED EVEN WHEN NOTHING ELSE CHANGED
 *
 * A part's price can move without the bundle being touched — that is the whole reason
 * bundles are compositions. So this recomputes from the parts on every save rather than
 * only when the discount changed, which means an operator who opens the bundle and
 * presses Save also repairs a price that had drifted. It is not a background job and it
 * does not pretend to be: it brings the stored figure back in step at the moment
 * somebody is looking at it.
 *
 * `derivePricing` OFF MEANS THE TYPED PRICE STANDS
 *
 * The parts are still recorded, so the PDP can still say what is inside, and the screen
 * still shows what the parts would imply. The owner simply is not bound by it.
 */
export async function saveBundle(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, regular: true, premium: true },
  });
  if (!product) backTo("/admin/products", refusalParams(values, [{ field: "productId", code: "productNotFound" }]));

  const discountKind = pick(values, "discountKind");
  const discountRaw = pick(values, "discountValue").trim();
  const discountValue = discountRaw === "" ? 0 : Number(discountRaw);
  const derivePricing = text(formData, "derivePricing") === "on";
  const isBundle = text(formData, "isBundle") === "on";

  /*
   * TURNING THE BUNDLE OFF IS A DELETE OF THE DEFINITION, NOT A HIDDEN FLAG.
   *
   * There is deliberately no `Bundle.active`. A `false` bundle would still be a bundle:
   * the PDP would still list its parts, the cart would still price from them, and the
   * product would still be selling at a derived price derived from nothing. Switching it
   * off has to actually stop it being a bundle, so it removes the definition and leaves
   * the product's own typed prices alone. `Cascade` on `Bundle.productId` means the parts
   * go with it, which is right — they are meaningless without the bundle they belong to.
   */
  if (!isBundle) {
    // The explicit `removeBundle` refuses when the product has order lines. The untick
    // is the same deletion reached from the other form, so it must refuse for the same
    // reason and with the same sentence — otherwise "untick it in the editor" is the
    // bypass around a guard that exists to protect a bundle somebody has been sold.
    const references = await productReferences(productId);
    if (!references) {
      backTo("/admin/products", refusalParams(values, [{ field: "productId", code: "productNotFound" }]));
    }
    const refusal = bundleRemoval({ isBundle: true, orderItems: references.orderItems });
    if (refusal) backTo(back, refusalParams(values, [refusal]));

    const existing = await prisma.bundle.findUnique({
      where: { productId },
      select: { _count: { select: { items: true } } },
    });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.bundle.delete({ where: { productId } });
        await tx.auditEntry.create({
          data: {
            entity: "Bundle",
            entityId: productId,
            action: "delete",
            field: "bundle",
            before: { parts: existing._count.items } as never,
            note: `no longer a bundle; the typed prices stand again`,
            who: process.env.ADMIN_USER ?? null,
          },
        });
      });
    }
    revalidateCatalogue();
    revalidatePath(back);
    await flashBack(back, existing ? "bundleRemoved" : "unchanged");
  }

  const parts = await bundleParts(productId);

  /*
   * QUANTITIES ARE EDITED ON THE SAME FORM, AND THEY ARE APPLIED FIRST.
   *
   * The whole bundle is one `<form>` — the discount, the derive switch and a quantity
   * box per part — because a bundle is one fact to the person editing it and splitting
   * it across three screens is how the price and the contents get out of step.
   *
   * The quantities have to land BEFORE the parts are re-read, or the price written a few
   * lines below would be derived from the quantities as they were before the save. That
   * ordering is the entire reason this block sits where it does.
   *
   * An item id that is not one of THIS bundle's is ignored rather than looked up. The
   * form is a list, and a hand-written POST naming somebody else's item must not be able
   * to change it — the same rule `addBundleItem` follows when it checks the item's
   * bundleId.
   */
  const owned = new Set(parts.map((part) => part.id));
  for (const [name, value] of Object.entries(values)) {
    if (!name.startsWith("qty__")) continue;
    const itemId = name.slice("qty__".length);
    if (!owned.has(itemId)) continue;

    const qty = Number(value.trim());
    if (!Number.isInteger(qty) || qty < 1) continue;
    const current = parts.find((part) => part.id === itemId);
    if (!current || current.qty === qty) continue;

    await prisma.bundleItem.update({ where: { id: itemId }, data: { qty } });
  }

  const afterQty = await bundleParts(productId);

  const complaint = validateBundleDiscount(
    afterQty.map((part) => ({ qty: part.qty, regular: part.regular, premium: part.premium })),
    discountKind,
    discountValue,
  );
  if (complaint) backTo(back, refusalParams(values, [{ field: "discountValue", code: complaint }]));

  const derived = deriveBundlePrices(
    afterQty.map((part) => ({ qty: part.qty, regular: part.regular, premium: part.premium })),
    isBundleDiscountKind(discountKind) ? discountKind : "percent",
    discountValue,
  );

  const before = { regular: product.regular, premium: product.premium };
  const prices = derivePricing ? { regular: derived.regular, premium: derived.premium } : null;

  await prisma.$transaction(async (tx) => {
    await tx.bundle.upsert({
      where: { productId },
      create: { productId, discountKind, discountValue, derivePricing },
      update: { discountKind, discountValue, derivePricing },
    });

    if (prices) {
      // Only write when it MOVED. Prisma would issue the UPDATE either way, and an
      // unchanged bundle would otherwise bump `Product.updatedAt` on every save, which
      // reads downstream as "this bundle was edited today".
      const nextRegular = prices.regular;
      const nextPremium = prices.premium;
      if (nextRegular !== product.regular || nextPremium !== product.premium) {
        await tx.product.update({
          where: { id: productId },
          data: { regular: nextRegular, premium: nextPremium },
        });
      }
    }

    await tx.auditEntry.create({
      data: {
        entity: "Bundle",
        entityId: productId,
        action: "update",
        field: "discount",
        before: { parts: afterQty.length } as never,
        after: { discountKind, discountValue, derivePricing, ...prices } as never,
        note:
          afterQty.length === 0
            ? "saved with no parts yet — the price is held at the floor until some are added"
            : `${afterQty.length} part${afterQty.length === 1 ? "" : "s"}, saving ₦${derived.savedRegular.toLocaleString("en-NG")} on the regular price`,
        who: process.env.ADMIN_USER ?? null,
      },
    });

    // A second audit row for the price itself, because "what did this bundle cost
    // before?" is the question a week later, and a discount row that only carries the
    // discount does not answer it.
    if (prices && (prices.regular !== before.regular || prices.premium !== before.premium)) {
      await tx.auditEntry.create({
        data: {
          entity: "Product",
          entityId: productId,
          action: "update",
          field: "regular/premium (derived from the bundle's parts)",
          before: before as never,
          after: prices as never,
          note: `parts came to ₦${derived.listRegular.toLocaleString("en-NG")} regular`,
          who: process.env.ADMIN_USER ?? null,
        },
      });
    }
  });

  revalidateCatalogue();
  revalidatePath(back);

  await flashBack(back, "bundle");
}

/**
 * Add one product as a part of a bundle.
 *
 * WHICH PRODUCTS MAY BE ADDED, AND WHY THE LIST IS NOT "EVERYTHING"
 *
 * A bundle may not contain a bundle. It would need the inner one priced before the outer
 * one could be priced, which is a recursion with no base case; the honest fix for "a
 * bundle of bundles" is a bundle with the parts listed flat, which is exactly what the
 * owner can already build. A product may also not be added to itself, for the same
 * reason and more obviously.
 *
 * The `@@unique([bundleId, productId, variationId])` is the real duplicate guard; this
 * function refuses first so the operator is told WHY rather than seeing a P2002.
 */
export async function addBundleItem(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const productId = text(formData, "productId");
  const partProductId = text(formData, "partProductId");
  const partVariationId = text(formData, "partVariationId") || null;
  const qtyRaw = text(formData, "qty").trim();
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const [bundle, part, variation] = await Promise.all([
    prisma.bundle.findUnique({ where: { productId }, select: { productId: true } }),
    prisma.product.findUnique({
      where: { id: partProductId },
      select: { id: true, name: true, bundle: { select: { productId: true } } },
    }),
    partVariationId
      ? prisma.productVariation.findUnique({
          where: { id: partVariationId },
          select: { id: true, productId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!bundle) backTo(back, refusalParams(values, [{ field: "partProductId", code: "notABundle" }]));
  if (!part) backTo(back, refusalParams(values, [{ field: "partProductId", code: "partNotFound" }]));

  // A variation must belong to the product it is offered under, or a hand-written POST
  // could price a bundle from a variation of something else entirely.
  if (variation && variation.productId !== part.id) {
    backTo(back, refusalParams(values, [{ field: "partVariationId", code: "partNotFound" }]));
  }

  if (part.id === productId) {
    backTo(back, refusalParams(values, [{ field: "partProductId", code: "bundleContainsItself" }]));
  }
  if (part.bundle) {
    backTo(back, refusalParams(values, [{ field: "partProductId", code: "bundleInBundle" }]));
  }

  const duplicate = await prisma.bundleItem.findFirst({
    where: { bundleId: productId, productId: part.id, variationId: partVariationId },
  });
  if (duplicate) {
    backTo(back, refusalParams(values, [{ field: "partProductId", code: "duplicateBundlePart" }]));
  }

  const qty = qtyRaw === "" ? 1 : Number(qtyRaw);
  if (!Number.isInteger(qty) || qty < 1) {
    backTo(back, refusalParams(values, [{ field: "qty", code: "badBundleQty" }]));
  }

  const last = await prisma.bundleItem.findFirst({
    where: { bundleId: productId },
    orderBy: [{ sortOrder: "desc" }],
    select: { sortOrder: true },
  });

  await prisma.$transaction([
    prisma.bundleItem.create({
      data: { bundleId: productId, productId: part.id, variationId: partVariationId, qty, sortOrder: (last?.sortOrder ?? -1) + 1 },
    }),
    prisma.auditEntry.create({
      data: {
        entity: "Bundle",
        entityId: productId,
        action: "update",
        field: "parts",
        note: `added ${part.name}${partVariationId ? " (one option)" : ""} ×${qty}`,
        who: process.env.ADMIN_USER ?? null,
      },
    }),
  ]);

  /*
   * REPRICED IMMEDIATELY, NOT ON THE NEXT SAVE.
   *
   * Adding a part changes what the bundle IS worth, and leaving a price that was derived
   * from the old parts in place until somebody presses Save is how a bundle ends up
   * selling at a price its contents do not justify. The derivation is the same function
   * the save path uses; only the trigger is different.
   */
  await repriceBundle(productId);

  revalidateCatalogue();
  revalidatePath(back);
  await flashBack(back, "bundlePart");
}

/**
 * Take a part out of a bundle.
 *
 * A part somebody has been SOLD as part of a bundle is not protected the way a sold
 * `OrderItem` is: an order line records the bundle, not which rows composed it, and the
 * line keeps its own frozen price. Removing a part therefore changes what the bundle is
 * worth from now on and leaves every past order exactly as it was — which is the correct
 * behaviour, and the reason this is a delete rather than a deactivation.
 */
export async function removeBundleItem(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  // No `submittedValues` / `refusalParams` here, deliberately: this action cannot be
  // refused. An item that is not this bundle's is IGNORED rather than reported, because
  // the only way to reach that state is a hand-written POST naming somebody else's item,
  // and an error message would confirm the item exists to whoever sent it.
  const productId = text(formData, "productId");
  const itemId = text(formData, "itemId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const item = await prisma.bundleItem.findUnique({
    where: { id: itemId },
    select: { id: true, bundleId: true, product: { select: { name: true } } },
  });

  // The item must belong to THIS bundle. A hand-written POST naming another bundle's
  // item must not be able to edit it.
  if (item && item.bundleId === productId) {
    await prisma.$transaction([
      prisma.bundleItem.delete({ where: { id: itemId } }),
      prisma.auditEntry.create({
        data: {
          entity: "Bundle",
          entityId: productId,
          action: "update",
          field: "parts",
          note: `removed ${item.product.name}`,
          who: process.env.ADMIN_USER ?? null,
        },
      }),
    ]);
    await repriceBundle(productId);
  }

  revalidateCatalogue();
  revalidatePath(back);
  await flashBack(back, item ? "bundlePartRemoved" : "unchanged");
}

/**
 * Remove the bundle definition outright — a named action, not only the `isBundle`
 * untick (Requirement 5.2).
 *
 * The `Bundle` row and its parts go; the PRODUCT survives at `/products/<slug>` and
 * sells at its own typed prices, which is the whole point of a bundle being a product
 * (see the schema). Unlike `removeBundleItem`, this CAN be refused: a bundle the shop
 * has sold is part of what explains those orders, so the composition is kept and the
 * refusal names the reference. The reversible path is the `isBundle` untick in the
 * editor, which makes the product a single item again without deleting anything the
 * order needs to be read.
 */
export async function removeBundle(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const productId = text(formData, "productId");
  const back = `/admin/products/${encodeURIComponent(productId)}`;

  const [bundle, references] = await Promise.all([
    prisma.bundle.findUnique({
      where: { productId },
      select: { _count: { select: { items: true } } },
    }),
    productReferences(productId),
  ]);
  if (!references) backTo("/admin/products", refusalParams(values, [{ field: "productId", code: "productNotFound" }]));

  const refusal = bundleRemoval({ isBundle: bundle !== null, orderItems: references.orderItems });
  if (refusal) backTo(back, refusalParams(values, [refusal]));

  // `bundleRemoval` has proved it is a bundle; this is the compiler's copy of that
  // proof, and it costs nothing on a row already in hand.
  if (!bundle) return;

  await prisma.$transaction(async (tx) => {
    await tx.bundle.delete({ where: { productId } });
    await tx.auditEntry.create({
      data: {
        entity: "Bundle",
        entityId: productId,
        action: "delete",
        field: "bundle",
        before: { parts: bundle._count.items } as never,
        note: "bundle removed by name; the product stays and its typed prices are what it sells at",
        who: process.env.ADMIN_USER ?? null,
      },
    });
  });

  revalidateCatalogue();
  revalidatePath(back);
  await flashBack(back, "bundleRemoved");
}

/**
 * Recompute a bundle's two prices from its parts and write them onto the product.
 *
 * A no-op when the bundle is not deriving its price, or when the bundle has no
 * `Bundle` row at all — which is why it is safe to call unconditionally after any change
 * to the parts.
 */
async function repriceBundle(productId: string): Promise<void> {
  const bundle = await prisma.bundle.findUnique({
    where: { productId },
    select: { discountKind: true, discountValue: true, derivePricing: true },
  });
  if (!bundle || !bundle.derivePricing) return;

  const parts = await bundleParts(productId);
  const derived = deriveBundlePrices(
    parts.map((part) => ({ qty: part.qty, regular: part.regular, premium: part.premium })),
    isBundleDiscountKind(bundle.discountKind) ? bundle.discountKind : "percent",
    bundle.discountValue,
  );

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { regular: true, premium: true },
  });
  if (!product) return;
  if (product.regular === derived.regular && product.premium === derived.premium) return;

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { regular: derived.regular, premium: derived.premium },
    }),
    prisma.auditEntry.create({
      data: {
        entity: "Product",
        entityId: productId,
        action: "update",
        field: "regular/premium (derived from the bundle's parts)",
        before: { regular: product.regular, premium: product.premium } as never,
        after: { regular: derived.regular, premium: derived.premium } as never,
        note: `the bundle's parts changed; priced from ₦${derived.listRegular.toLocaleString("en-NG")} regular`,
        who: process.env.ADMIN_USER ?? null,
      },
    }),
  ]);
}
