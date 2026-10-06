"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { flashBack } from "./flash";
import { requireAdmin } from "@/lib/admin-auth";

import { validateCoupon, validatePromotion } from "./promo-guard.ts";
import type { Failure } from "./confirm-guard.ts";

/**
 * Every promotion and coupon mutation.
 *
 * WHY A THIRD `'use server'` MODULE
 *
 * `actions.ts` is the fitment console and `catalogue-actions.ts` is the shop's CRUD.
 * This one changes what a customer PAYS, which is neither of those, and burying it in
 * either would make the file you open to find "how do I make a price cheaper" the
 * wrong one. The helpers below are duplicated for the reason `catalogue-actions.ts`
 * documents: a module carrying `'use server'` may only export async functions, so a
 * shared non-async helper cannot live in one and be imported by the other.
 *
 * `requireAdmin()` is the first statement of every function, as everywhere else in the
 * console: a Server Action is a POST endpoint, so a button that only renders for an
 * authenticated operator is a UI convenience and not a boundary.
 *
 * THE REVALIDATION SET
 *
 * A promotion is read on the product page, the shop, the Fit Finder's result and the
 * checkout, so those are all named. `/api/discount` is a route handler and is not
 * cached, so it picks the change up on the next request without help.
 */

const ACTION_REQUEST_URL = "https://luxeride.local/admin";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

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

/** Field names are scoped to their row, for the reason `catalogue-actions.ts` explains. */
function pickScoped(values: Record<string, string>, base: string, id: string): string {
  return values[`${base}__${id}`] ?? values[base] ?? "";
}

function refusalParams(values: Record<string, string>, failures: Failure[]): URLSearchParams {
  const params = new URLSearchParams();
  params.set("e", failures.map((failure) => `${failure.field}~${failure.code}`).join(","));
  for (const [field, value] of Object.entries(values)) {
    if (field === "id") continue;
    if (value.length > 0 && value.length <= 300) params.set(`v.${field}`, value);
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

/** A price change has to reach the shop, the product pages and the Fit Finder. */
function revalidatePricing(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/promotions");
  revalidatePath("/admin/coupons");
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/products");
  revalidatePath("/fit-finder");
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

// ─── Promotions ─────────────────────────────────────────────────────────────

export async function createPromotion(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const back = "/admin/promotions";

  const [takenSlugs, categories, products] = await Promise.all([
    prisma.promotion.findMany({ select: { slug: true } }),
    // `id` as well as `slug`: the form submits the slug a human recognises, and the
    // column is a foreign key, so the row is resolved from one to the other here.
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.product.findMany({ select: { id: true, slug: true } }),
  ]);

  const scope = pick(values, "scope");
  const check = validatePromotion(
    {
      name: pick(values, "name"),
      slug: pick(values, "slug"),
      kind: pick(values, "kind"),
      value: pick(values, "value"),
      scope,
      categorySlug: pick(values, "categorySlug"),
      productSlug: pick(values, "productSlug"),
      startsAt: pick(values, "startsAt"),
      endsAt: pick(values, "endsAt"),
      active: text(formData, "active") === "on",
      label: pick(values, "label"),
      headline: pick(values, "headline"),
      description: pick(values, "description"),
      badge: pick(values, "badge"),
    },
    takenSlugs.map((row) => row.slug),
    categories.map((row) => row.slug),
    products.map((row) => row.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  // The two narrow scopes need their row resolved from a slug. A scope with a null id
  // is a promotion that silently applies to nothing, which looks identical to a
  // promotion that is not running.
  const categoryId =
    scope === "category"
      ? categories.find((row) => row.slug === check.value.categorySlug)?.id
      : null;
  const productId =
    scope === "product" ? products.find((row) => row.slug === check.value.productSlug)?.id : null;

  const created = await prisma.promotion.create({
    data: {
      name: check.value.name,
      slug: check.value.slug,
      kind: check.value.kind,
      value: Number(check.value.value),
      scope: check.value.scope,
      categoryId: categoryId ?? null,
      productId: productId ?? null,
      startsAt: check.value.starts,
      endsAt: check.value.ends,
      active: check.value.active,
      label: check.value.label.trim() || null,
      headline: check.value.headline.trim() || null,
      description: check.value.description.trim() || null,
      badge: check.value.badge.trim() || null,
    },
  });

  await audit({
    entity: "Promotion",
    entityId: created.id,
    action: "create",
    after: { slug: created.slug, kind: created.kind, value: created.value, scope: created.scope },
    note: `promotion "${created.name}" created — ${created.kind} ${created.value}`,
  });

  revalidatePricing();
  await flashBack(back, "promotion");
}

export async function updatePromotion(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/promotions";

  const promotion = await prisma.promotion.findUnique({ where: { id } });
  if (!promotion) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  const [takenSlugs, categories, products] = await Promise.all([
    prisma.promotion.findMany({ select: { slug: true } }),
    // `id` as well as `slug`: the form submits the slug a human recognises, and the
    // column is a foreign key, so the row is resolved from one to the other here.
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.product.findMany({ select: { id: true, slug: true } }),
  ]);

  const scope = pickScoped(values, "scope", id);
  const check = validatePromotion(
    {
      name: pickScoped(values, "name", id),
      slug: pickScoped(values, "slug", id),
      kind: pickScoped(values, "kind", id),
      value: pickScoped(values, "value", id),
      scope,
      categorySlug: pickScoped(values, "categorySlug", id),
      productSlug: pickScoped(values, "productSlug", id),
      startsAt: pickScoped(values, "startsAt", id),
      endsAt: pickScoped(values, "endsAt", id),
      active: text(formData, `active__${id}`) === "on",
      label: pickScoped(values, "label", id),
      headline: pickScoped(values, "headline", id),
      description: pickScoped(values, "description", id),
      badge: pickScoped(values, "badge", id),
    },
    takenSlugs.map((row) => row.slug).filter((slug) => slug !== promotion.slug),
    categories.map((row) => row.slug),
    products.map((row) => row.slug),
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const categoryId =
    check.value.scope === "category"
      ? categories.find((row) => row.slug === check.value.categorySlug)?.id ?? null
      : null;
  const productId =
    check.value.scope === "product"
      ? products.find((row) => row.slug === check.value.productSlug)?.id ?? null
      : null;

  /**
   * ONLY WHAT WAS SUBMITTED IS WRITTEN, and this is the fix for a real bug.
   *
   * The edit form renders SEVEN fields — name, kind, value, label, start, end, on/off
   * — and the create form renders thirteen. The action used to build a complete row
   * from all thirteen, so every edit submitted the six it does not render as empty
   * strings and therefore WIPED them:
   *
   *   - `headline` and `description` became null, which is what the homepage hero and
   *     the offer band read, so saving a promotion silently un-wrote the season
   *   - `scope` fell back to `site`, quietly widening a category-scoped promotion to
   *     the whole shop
   *   - `slug` was recomputed from the name
   *
   * That is what "deactivate is not working" was: you untick it, tick it again, save,
   * and the promotion comes back with no headline and a different scope, so it does
   * not look like the switch moved.
   *
   * So the update STARTS FROM THE STORED ROW and overrides only a field whose input
   * actually appears in the submitted form. A field that was not sent is not changed,
   * which is also the correct behaviour for a partial form by definition.
   */
  const sent = new Set(Object.keys(values));
  const sentScoped = (base: string): boolean => sent.has(base) || sent.has(`${base}__${id}`);

  const next = {
    ...promotion,
    name: check.value.name,
    // The slug is only recomputed when the form SENT one and it was blank; otherwise
    // the stored slug is kept, because a custom slug is a deliberate choice.
    slug: sentScoped("slug") ? check.value.slug : promotion.slug,
    kind: check.value.kind,
    value: Number(check.value.value),
    active: check.value.active,
  };

  if (sentScoped("label")) next.label = check.value.label.trim() || null;
  if (sentScoped("badge")) next.badge = check.value.badge.trim() || null;
  if (sentScoped("headline")) next.headline = check.value.headline.trim() || null;
  if (sentScoped("description")) next.description = check.value.description.trim() || null;
  if (sentScoped("startsAt")) next.startsAt = check.value.starts;
  if (sentScoped("endsAt")) next.endsAt = check.value.ends;
  if (sentScoped("scope")) {
    next.scope = check.value.scope;
    next.categoryId = categoryId;
    next.productId = productId;
  }

  /**
   * COMPARED BY VALUE, NOT BY REFERENCE.
   *
   * `!==` on two `Date` objects with the same instant is `true`, because they are two
   * objects. So a change detector written this way reports EVERY save as a change,
   * which means an audit row every time and a "Saved" notice for something that
   * changed nothing. Dates and nulls are compared by their time.
   */
  const same = (a: unknown, b: unknown): boolean => {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return a === b;
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => !same(promotion[key], next[key]),
  );

  if (changed) {
    await prisma.promotion.update({ where: { id }, data: next });
    await audit({
      entity: "Promotion",
      entityId: id,
      action: "update",
      before: { kind: promotion.kind, value: promotion.value, active: promotion.active },
      after: { kind: next.kind, value: next.value, active: next.active },
      note: `promotion "${next.name}" updated`,
    });
    revalidatePricing();
  }

  await flashBack(back, changed ? "promotion" : "unchanged");
}

/**
 * Delete a promotion.
 *
 * `Cascade` on the category and product relations means a promotion cannot outlive the
 * thing it discounts, so this only ever removes a row that is either scoped sitewide or
 * attached to something that still exists.
 *
 * Deactivating is usually the right move instead — an order written last week should
 * still be explainable next month — so the screen says so above the button.
 */
export async function deletePromotion(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/promotions";

  const promotion = await prisma.promotion.findUnique({ where: { id } });
  if (!promotion) backTo(back, refusalParams(values, [{ field: "name", code: "required" }]));

  await prisma.promotion.delete({ where: { id } });
  await audit({
    entity: "Promotion",
    entityId: id,
    action: "delete",
    before: { slug: promotion.slug, name: promotion.name, kind: promotion.kind, value: promotion.value },
    note: `promotion "${promotion.name}" deleted`,
  });

  revalidatePricing();
  await flashBack(back, "promotionDeleted");
}

// ─── Coupons ────────────────────────────────────────────────────────────────

export async function createCoupon(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const back = "/admin/coupons";

  const taken = (await prisma.coupon.findMany({ select: { code: true } })).map((row) => row.code);

  const check = validateCoupon(
    {
      code: pick(values, "code"),
      kind: pick(values, "kind"),
      value: pick(values, "value"),
      minSubtotal: pick(values, "minSubtotal"),
      maxRedemptions: pick(values, "maxRedemptions"),
      startsAt: pick(values, "startsAt"),
      endsAt: pick(values, "endsAt"),
      active: text(formData, "active") === "on",
      note: pick(values, "note"),
    },
    taken,
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const created = await prisma.coupon.create({
    data: {
      code: check.value.code,
      kind: check.value.kind,
      value: Number(check.value.value),
      minSubtotal: check.value.minSubtotal.trim() === "" ? null : Number(check.value.minSubtotal),
      maxRedemptions:
        check.value.maxRedemptions.trim() === "" ? null : Number(check.value.maxRedemptions),
      startsAt: check.value.starts,
      endsAt: check.value.ends,
      active: check.value.active,
      note: check.value.note.trim() || null,
    },
  });

  await audit({
    entity: "Coupon",
    entityId: created.id,
    action: "create",
    after: { code: created.code, kind: created.kind, value: created.value },
    note: `coupon ${created.code} created — ${created.kind} ${created.value}`,
  });

  revalidatePricing();
  await flashBack(back, "coupon");
}

export async function updateCoupon(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/coupons";

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) backTo(back, refusalParams(values, [{ field: "code", code: "required" }]));

  const taken = (await prisma.coupon.findMany({ select: { code: true } }))
    .map((row) => row.code)
    .filter((code) => code !== coupon.code);

  const check = validateCoupon(
    {
      code: pickScoped(values, "code", id),
      kind: pickScoped(values, "kind", id),
      value: pickScoped(values, "value", id),
      minSubtotal: pickScoped(values, "minSubtotal", id),
      maxRedemptions: pickScoped(values, "maxRedemptions", id),
      startsAt: pickScoped(values, "startsAt", id),
      endsAt: pickScoped(values, "endsAt", id),
      active: text(formData, `active__${id}`) === "on",
      note: pickScoped(values, "note", id),
    },
    taken,
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const next = {
    code: check.value.code,
    kind: check.value.kind,
    value: Number(check.value.value),
    minSubtotal: check.value.minSubtotal.trim() === "" ? null : Number(check.value.minSubtotal),
    maxRedemptions:
      check.value.maxRedemptions.trim() === "" ? null : Number(check.value.maxRedemptions),
    startsAt: check.value.starts,
    endsAt: check.value.ends,
    active: check.value.active,
    note: check.value.note.trim() || null,
  };

  const changed = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => coupon[key] !== next[key],
  );

  if (changed) {
    await prisma.coupon.update({ where: { id }, data: next });
    await audit({
      entity: "Coupon",
      entityId: id,
      action: "update",
      before: { kind: coupon.kind, value: coupon.value, active: coupon.active },
      after: { kind: next.kind, value: next.value, active: next.active },
      note: `coupon ${next.code} updated`,
    });
    revalidatePricing();
  }

  await flashBack(back, changed ? "coupon" : "unchanged");
}

/**
 * Delete a coupon.
 *
 * REFUSED once it has been used, because an order that was paid with a code has to stay
 * explainable. Deactivating it does that too and lets the code keep its history; this
 * only removes a code nobody has ever redeemed.
 */
export async function deleteCoupon(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const id = text(formData, "id");
  const back = "/admin/coupons";

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) backTo(back, refusalParams(values, [{ field: "code", code: "required" }]));

  if (coupon.redemptions > 0) {
    backTo(back, refusalParams(values, [{ field: "code", code: "couponUsed" }]));
  }

  await prisma.coupon.delete({ where: { id } });
  await audit({
    entity: "Coupon",
    entityId: id,
    action: "delete",
    before: { code: coupon.code, kind: coupon.kind, value: coupon.value },
    note: `coupon ${coupon.code} deleted`,
  });

  revalidatePricing();
  await flashBack(back, "couponDeleted");
}