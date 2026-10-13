import { prisma } from "@/lib/db";

/**
 * THE DELIVERY ZONES, FROM THE DATABASE.
 *
 * These used to be a compile-time constant (`src/data/locations.ts`) that the CHECKOUT
 * read, while `/api/orders` charged from the `Location` TABLE — and the admin screen
 * wrote to neither, so an edit there changed nothing at all. Two sources for one fee is
 * exactly how a customer is shown one price and charged another.
 *
 * So the table is the single source now. The constant is kept only as the SEED for a
 * fresh database; nothing in the running app reads it.
 *
 * ── A ZONE IS A NIGERIAN STATE, AND A ZONE CAN BE WITHDRAWN ──────────────────
 *
 * `listDeliveryZones()` is what every CUSTOMER-FACING surface reads: the checkout, the
 * cart, the delivery policy, the contact page, the PDP delivery line and the fee band.
 * It returns only `active` rows, so a withdrawn zone vanishes from all of them at once.
 * `listDeliveryZonesForAdmin()` returns everything, withdrawn rows included, so the
 * console can show and restore them.
 *
 * Both order cheapest-first, which is the order a customer scans a fee list in and the
 * order the admin list shows, so the two cannot disagree about it.
 */
export interface DeliveryZone {
  id: string;
  /** Stable identifier, so renaming a zone cannot break a stored order. */
  slug: string;
  name: string;
  /** Naira, whole. */
  fee: number;
  /** Free text, e.g. "24–48 hours". */
  eta: string;
}

/** The admin view: the same row plus whether it is on the menu. */
export interface AdminDeliveryZone extends DeliveryZone {
  active: boolean;
}

/** The zones on the menu. Every customer-facing figure reads this and only this. */
export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  const rows = await prisma.location.findMany({
    where: { active: true },
    orderBy: [{ fee: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, fee: true, etaText: true },
  });

  return rows.map(toZone);
}

/** Everything, including withdrawn zones, for `/admin/delivery`. */
export async function listDeliveryZonesForAdmin(): Promise<AdminDeliveryZone[]> {
  const rows = await prisma.location.findMany({
    // On the menu first, then cheapest-first — so the withdrawn rows, which cannot be
    // edited into a live order, sit together at the end rather than scattered by fee.
    orderBy: [{ active: "desc" }, { fee: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, fee: true, etaText: true, active: true },
  });

  return rows.map((row) => ({ ...toZone(row), active: row.active }));
}

function toZone(row: {
  id: string;
  slug: string;
  name: string;
  fee: number;
  etaText: string;
}): DeliveryZone {
  return { id: row.id, slug: row.slug, name: row.name, fee: row.fee, eta: row.etaText };
}
