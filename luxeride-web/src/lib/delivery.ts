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
 * Ordered cheapest-first, which is the order a customer scans a fee list in and the
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

export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  const rows = await prisma.location.findMany({
    orderBy: [{ fee: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, fee: true, etaText: true },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    fee: row.fee,
    eta: row.etaText,
  }));
}
