"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { flashBack } from "../flash";

/**
 * DELIVERY ZONES: create, edit, delete, and set the same fee on many at once.
 *
 * WHAT WAS WRONG WITH THE OLD ACTION
 *
 * `updateDeliveryZone` validated its input against the compile-time `LOCATIONS`
 * constant and then redirected with a "saved" message. It never wrote anything. The
 * constant cannot change at runtime, the checkout READ that constant while `/api/orders`
 * charged from the `Location` TABLE, and so the admin screen's "Save zone" was a button
 * that did nothing and the fee a customer saw could differ from the fee they owed.
 *
 * So every action here writes the `Location` table, and every surface reads it
 * (`src/lib/delivery.ts`). One fee, one row, one place to change it.
 *
 * WHY A REFUSAL IS A QUERY STRING AND A SUCCESS IS NOT
 *
 * The console's rule (`flash.ts`): a confirmation is a message and rides in a cookie; a
 * refusal is a form state and rides in the URL, because it must survive a POST from a
 * browser with scripting off. These are short forms, so the refusal carries only its
 * code — no field echo — which is all this screen needs to say what to fix.
 */

const ACTION_REQUEST_URL = "https://admin.invalid/";

/** Reads one text field (`fitment-engine` §8.9 shape). */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A URL-safe slug from a zone name. Stable identity, so a rename cannot break orders. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Refuse with a code the page renders as a sentence. */
function refusal(code: string): never {
  redirect(`/admin/delivery?e=${encodeURIComponent(code)}`);
}

/** Every surface that renders a fee or a zone name. */
function revalidateDelivery(): void {
  revalidatePath("/admin/delivery");
  // The policy page and the contact page are PRERENDERED, so a fee change has to
  // invalidate them or the site will keep publishing last week's prices.
  revalidatePath("/policies/delivery");
  revalidatePath("/contact");
}

/**
 * CREATE a zone, or UPDATE one — one action, because the two differ only in whether an
 * id was submitted, and a pair of near-identical actions is how the halves drift.
 */
export async function saveDeliveryZone(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const id = text(formData, "id");
  const name = text(formData, "name").trim();
  const eta = text(formData, "etaText").trim();
  const fee = Number(text(formData, "fee").trim());

  if (name === "") refusal("deliveryZoneNameRequired");
  if (!Number.isInteger(fee) || fee < 0) refusal("deliveryFeeInvalid");
  if (eta === "") refusal("deliveryEtaRequired");

  const who = process.env.ADMIN_USER ?? null;

  if (id === "") {
    const slug = slugify(name);
    if (slug === "") refusal("deliveryZoneNameRequired");

    const clash = await prisma.location.findFirst({
      where: { OR: [{ slug }, { name }] },
      select: { id: true },
    });
    if (clash) refusal("deliveryZoneExists");

    // An id is minted here rather than by the column default so the create and its
    // audit row can sit in ONE transaction — otherwise a failure between the two
    // leaves a zone with no record of who added it.
    const createdId = randomUUID();
    await prisma.$transaction([
      prisma.location.create({ data: { id: createdId, slug, name, fee, etaText: eta } }),
      prisma.auditEntry.create({
        data: {
          entity: "Location",
          entityId: createdId,
          action: "create",
          field: "fee",
          after: fee,
          note: `delivery zone "${name}" created — ₦${fee}, "${eta}"`,
          who,
        },
      }),
    ]);

    revalidateDelivery();
    await flashBack("/admin/delivery", "deliveryZoneAdded");
    return;
  }

  const current = await prisma.location.findUnique({
    where: { id },
    select: { name: true, fee: true, etaText: true },
  });
  if (!current) refusal("deliveryZoneNotFound");

  if (current.name !== name) {
    const clash = await prisma.location.findFirst({
      where: { name, id: { not: id } },
      select: { id: true },
    });
    if (clash) refusal("deliveryZoneExists");
  }

  // An unchanged save is not a change: no audit row, no timestamp, and the operator is
  // told so rather than being shown a "saved" for nothing.
  if (current.name === name && current.fee === fee && current.etaText === eta) {
    revalidateDelivery();
    await flashBack("/admin/delivery", "unchanged");
    return;
  }

  await prisma.$transaction([
    prisma.location.update({ where: { id }, data: { name, fee, etaText: eta } }),
    prisma.auditEntry.create({
      data: {
        entity: "Location",
        entityId: id,
        action: "update",
        field: "fee",
        before: current.fee,
        after: fee,
        note:
          `delivery zone "${name}" updated — ` +
          `fee ₦${current.fee} → ₦${fee}, window "${current.etaText}" → "${eta}"` +
          (current.name === name ? "" : `, name "${current.name}" → "${name}"`),
        who,
      },
    }),
  ]);

  revalidateDelivery();
  await flashBack("/admin/delivery", "deliveryZoneSaved");
}

/**
 * SET ONE FEE ON MANY ZONES AT ONCE — the owner's actual ask: "assign an amount to
 * multiple places at once when I select them".
 *
 * Ticked ids only. Unlike the vehicles screen there is no filter here that narrows the
 * list behind the operator's back, so the ids on screen ARE the selection — the reason
 * that screen reads by make instead of by id does not apply to a four-row table.
 *
 * Only the zones that actually change are written, each audited on its own row, and a
 * repeat of the same fee reports `unchanged` rather than inventing a change.
 */
export async function bulkSetDeliveryFee(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const ids = formData
    .getAll("zoneIds")
    .filter((value): value is string => typeof value === "string" && value !== "");

  if (ids.length === 0) refusal("deliveryNoSelection");

  const fee = Number(text(formData, "bulkFee").trim());
  if (!Number.isInteger(fee) || fee < 0) refusal("deliveryFeeInvalid");

  // Blank means "leave the window alone" — this action is about the fee, and forcing the
  // operator to retype an ETA to change a price is how a window gets overwritten.
  const eta = text(formData, "bulkEta").trim();

  const rows = await prisma.location.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, fee: true, etaText: true },
  });

  const changed = rows.filter((row) => row.fee !== fee || (eta !== "" && row.etaText !== eta));
  if (changed.length === 0) {
    revalidateDelivery();
    await flashBack("/admin/delivery", "unchanged");
    return;
  }

  const who = process.env.ADMIN_USER ?? null;
  const names = changed.map((row) => row.name).join(", ");

  await prisma.$transaction([
    prisma.location.updateMany({
      where: { id: { in: changed.map((row) => row.id) } },
      data: { fee, ...(eta === "" ? {} : { etaText: eta }) },
    }),
    prisma.auditEntry.createMany({
      data: changed.map((row) => ({
        entity: "Location",
        entityId: row.id,
        action: "update",
        field: "fee",
        before: row.fee,
        after: fee,
        note:
          `bulk: fee set to ₦${fee} on ${changed.length} zone${changed.length === 1 ? "" : "s"}` +
          (eta === "" ? "" : ` and window to "${eta}"`) +
          ` (${names})`,
        who,
      })),
    }),
  ]);

  revalidateDelivery();
  await flashBack("/admin/delivery", "deliveryBulkSaved");
}

/**
 * REMOVE a zone. Refused while an order points at it: `Order.locationId` is a restricted
 * foreign key, and the honest answer to "can I delete Lagos?" is "not while Lagos orders
 * exist" rather than a database error. Withdrawing the zone from the checkout is not
 * offered because there is no "inactive" column — a zone is either on the menu or gone.
 */
export async function deleteDeliveryZone(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const id = text(formData, "id");
  if (id === "") refusal("deliveryZoneNotFound");

  const zone = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  if (!zone) refusal("deliveryZoneNotFound");

  const orders = await prisma.order.count({ where: { locationId: id } });
  if (orders > 0) refusal("deliveryZoneInUse");

  const who = process.env.ADMIN_USER ?? null;
  await prisma.$transaction([
    prisma.location.delete({ where: { id } }),
    prisma.auditEntry.create({
      data: {
        entity: "Location",
        entityId: id,
        action: "delete",
        field: "fee",
        note: `delivery zone "${zone.name}" deleted`,
        who,
      },
    }),
  ]);

  revalidateDelivery();
  await flashBack("/admin/delivery", "deliveryZoneDeleted");
}
