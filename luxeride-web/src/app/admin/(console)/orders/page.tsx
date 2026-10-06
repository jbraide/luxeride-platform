import Link from "next/link";

import { prisma } from "@/lib/db";
import { fmtNaira } from "@/lib/pricing";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/order-status";

/**
 * `/admin/orders` — every order placed through checkout.
 *
 * ── THE GAP THIS SCREEN CLOSES ───────────────────────────────────────────────
 *
 * Orders were being written to `Order` and `OrderItem` on every checkout, and
 * nothing on the server ever read them back: the console's nav was Fitment,
 * Catalogue and Price, and the only code that touched `prisma.order` was the
 * customer-facing `/order/<reference>` lookup. So the owner could take money and
 * have nowhere to look. This is that screen.
 *
 * It is a LIST and links to `/admin/orders/[id]` for the detail, the same shape
 * `/admin/layouts` uses, because a UUID is not something an operator can find by
 * hand — the row is the entry point and the reference is the handle.
 *
 * ── WHAT IS SHOWN, AND WHAT IS DELIBERATELY NOT ──────────────────────────────
 *
 * The money, the car, the option, the zone AND the contact details, because every
 * one of those is what the owner needs to send the order. What is NOT shown is the
 * phone in a copyable form on this index — it is on the detail screen, where the
 * operator has actually decided to act on one order, which is the same reasoning
 * `/admin/demand` uses for not listing numbers it does not need.
 *
 * `status` is a plain `String` on the row and is read as one. A value written by a
 * workstream that has not landed yet still renders; `orderStatusLabel` falls
 * through to the raw string rather than hiding it.
 */

/**
 * NEVER PRERENDER. See `demand/page.tsx` for the full argument.
 *
 * This page reads `searchParams`, which already opts a route into dynamic
 * rendering, so this export is belt-and-braces — but it is the RIGHT belt: the
 * whole page is a live reading of the order book, and a build-time snapshot of it
 * would be an order list frozen on deploy day.
 */
export const dynamic = "force-dynamic";

/** Lagos, like the audit log — an order timestamp has to line up with the thread. */
const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawStatus = typeof params.s === "string" ? params.s : "";
  const status = (ORDER_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : "";
  const rawQuery = typeof params.q === "string" ? params.q.trim() : "";

  const search =
    rawQuery === ""
      ? {}
      : {
          OR: [
            { reference: { contains: rawQuery, mode: "insensitive" as const } },
            { customerName: { contains: rawQuery, mode: "insensitive" as const } },
            { phone: { contains: rawQuery } },
          ],
        };

  // An explicit status wins over a text search, matching `/admin/layouts`: the
  // filter bar is a set of mutually exclusive readings, not a query builder.
  const where = status !== "" ? { status } : rawQuery === "" ? {} : search;

  const [total, counts, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
  ]);

  const countFor = (value: string): number =>
    counts.find((row) => row.status === value)?._count._all ?? 0;

  const statusHref = (next: string): string => {
    const nextParams = new URLSearchParams();
    if (next !== "") nextParams.set("s", next);
    const search = nextParams.toString();
    return search === "" ? "/admin/orders" : `/admin/orders?${search}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Orders</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
          {orders.length} shown of {total}
        </span>
      </div>

      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-muted">
        Every order placed through checkout, newest first. The reference is the handle the
        customer was handed and the key their order page is read by. Open one to change its
        status, copy the message, or open the WhatsApp thread.
      </p>

      {/* The status filter. Counts come from a `groupBy`, so a zero-count status
          still appears — "nothing pending" is a fact worth seeing. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href={statusHref("")}
          aria-current={status === "" ? "page" : undefined}
          className={`font-mono text-xs uppercase tracking-widest ${
            status === "" ? "text-accent" : "text-fg-muted hover:text-accent"
          }`}
        >
          All <span className="text-accent-dim">{total}</span>
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link
            key={value}
            href={statusHref(value)}
            aria-current={status === value ? "page" : undefined}
            className={`font-mono text-xs uppercase tracking-widest ${
              status === value ? "text-accent" : "text-fg-muted hover:text-accent"
            }`}
          >
            {orderStatusLabel(value)} <span className="text-accent-dim">{countFor(value)}</span>
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/orders" className="mt-4 flex max-w-md gap-2">
        {status !== "" && <input type="hidden" name="s" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={rawQuery}
          placeholder="Search reference, name or phone"
          aria-label="Search reference, name or phone"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
        >
          Search
        </button>
      </form>

      {orders.length === 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-surface/60 px-5 py-5">
          <h3 className="font-display text-base font-semibold text-accent">No orders to show</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg/80">
            {total === 0
              ? "Nothing has been ordered yet. Every order placed through /checkout is written to the Order and OrderItem tables and appears here, so an empty list means an empty order book rather than a broken screen."
              : "Nothing matches this filter. Clear the status above or search a different reference."}
          </p>
        </section>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[11px] uppercase tracking-widest text-accent-dim">
              <th className="py-2 pr-4 font-normal">Reference</th>
              <th className="py-2 pr-4 font-normal">Placed</th>
              <th className="py-2 pr-4 font-normal">Customer</th>
              <th className="py-2 pr-4 font-normal">Items</th>
              <th className="py-2 pr-4 font-normal">Total</th>
              <th className="py-2 pr-4 font-normal">Payment</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-border align-top">
                <td className="py-2 pr-4 font-mono text-xs">
                  <Link
                    href={`/admin/orders/${encodeURIComponent(order.id)}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {order.reference}
                  </Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-[11px] text-accent-dim">
                  {TIMESTAMP.format(order.createdAt)}
                </td>
                <td className="py-2 pr-4">
                  {order.customerName}
                  <span className="block font-mono text-[11px] text-fg-muted">{order.phone}</span>
                </td>
                <td className="py-2 pr-4 font-mono text-[11px] text-fg-muted">
                  {order._count.items} line{order._count.items === 1 ? "" : "s"}
                </td>
                <td className="py-2 pr-4 font-mono text-sm text-accent">{fmtNaira(order.total)}</td>
                <td className="py-2 pr-4 font-mono text-[11px] uppercase text-fg-muted">
                  {order.paymentMethod === "prepay" ? "Prepay" : "On delivery"}
                </td>
                <td className="py-2 font-mono text-[11px] uppercase">
                  <span
                    className={
                      order.status === "cancelled"
                        ? "text-[#FF6B35]"
                        : order.status === "fulfilled"
                          ? "text-accent-dim"
                          : order.status === "confirmed"
                            ? "text-accent"
                            : "text-fg-muted"
                    }
                  >
                    {orderStatusLabel(order.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs leading-relaxed text-fg-muted">
        Capped at the most recent 200 rows, and the status filter narrows within that cap. The cap
        is a display limit, not a retention one — nothing prunes the order book.
      </p>
    </div>
  );
}
