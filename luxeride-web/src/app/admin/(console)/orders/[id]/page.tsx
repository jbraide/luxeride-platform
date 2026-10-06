import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { fmtNaira } from "@/lib/pricing";
import { ZERO_FEE_LABEL } from "@/lib/order-pricing";
import { customerThreadLink } from "@/lib/whatsapp";
import { ORDER_STATUSES, orderStatusHint, orderStatusLabel } from "@/lib/order-status";
import { messageFor, readFailures } from "../../confirm-guard";
import { setOrderStatus } from "../../order-actions";
import CopyButton from "./CopyButton";

/**
 * `/admin/orders/[id]` — one order, and the only place its status changes.
 *
 * ── WHY THE DETAIL IS A SEPARATE ROUTE ───────────────────────────────────────
 *
 * The index is a list of handles; this is the order. Everything the owner needs to
 * work one — the address to deliver to, the phone to call, the option that was
 * actually bought, the exact text the customer sent, and the status control — is on
 * one screen, because the alternative (act on the list row) means doing it without
 * seeing what is being acted on.
 *
 * ── WHAT IS READ, AND FROM WHERE ─────────────────────────────────────────────
 *
 * The money figures are the STORED ones: `subtotal`, `shippingFee`, `discount`,
 * `total`. They are not recomputed, and that is the point of freezing them at write
 * time — a price change or a layout split must not rewrite what this order was. The
 * car, the product name and the option are read through their foreign keys for
 * DISPLAY only; the brand, model and year that were sold are the `OrderItem`
 * snapshots, exactly as the customer-facing `/order/<reference>` page does it.
 *
 * ── THE STATUS FORM IS A PLAIN POST ──────────────────────────────────────────
 *
 * No client state, no `useActionState`: a `<form>` posting to a Server Action, which
 * is how every other control in this console works and the reason it works with
 * scripting disabled. The optional note is stored VERBATIM on the `AuditEntry`, so
 * the record of why an order was cancelled is the operator's own sentence and not a
 * generated one.
 */

const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">{label}</p>
      <div className="mt-1 text-sm text-fg/90">{children}</div>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const failures = readFailures(query);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { slug: true, name: true } },
          variation: { select: { slug: true, name: true } },
        },
      },
    },
  });

  // A missing row is a 404 rather than an empty page: the id came from a link this
  // screen drew, so an id that resolves to nothing means the order was removed.
  if (!order) notFound();

  // The status the radio group should start on. On a REFUSAL the redirect carries the
  // submitted value back, so the operator does not lose the choice they made — the
  // same round trip every other console form performs.
  const submittedStatus =
    typeof query["v.status"] === "string" && (ORDER_STATUSES as readonly string[]).includes(query["v.status"])
      ? query["v.status"]
      : null;
  const selectedStatus = submittedStatus ?? order.status;

  const threadLink = customerThreadLink(order.phone);

  const attribution = (
    [
      { label: "Source", value: order.utmSource },
      { label: "Medium", value: order.utmMedium },
      { label: "Campaign", value: order.utmCampaign },
      { label: "Content", value: order.utmContent },
      { label: "Term", value: order.utmTerm },
      { label: "Referrer", value: order.referrer },
      { label: "Landing page", value: order.landingPath },
    ] satisfies { label: string; value: string | null }[]
  ).filter((entry) => entry.value !== null && entry.value !== "");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">Order</p>
          <h2 className="font-mono text-lg font-semibold text-accent">{order.reference}</h2>
        </div>
        <Link
          href="/admin/orders"
          className="text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
        >
          ← All orders
        </Link>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Placed {TIMESTAMP.format(order.createdAt)} · Lagos time. Currently{" "}
        <span className="font-mono uppercase text-accent-dim">{orderStatusLabel(order.status)}</span>.
      </p>

      {failures.size > 0 && (
        <div className="mt-4 space-y-1 rounded-xl border border-[#FF6B35] px-4 py-3">
          {[...failures.entries()].map(([field, code]) => (
            <p key={field} className="text-sm text-[#FF6B35]">
              <span className="font-mono">{field}</span> — {messageFor(code)}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── LEFT: what was ordered ─────────────────────────────────────── */}
        <div>
          <h3 className="font-display text-base font-semibold">What was ordered</h3>

          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-[11px] uppercase tracking-widest text-accent-dim">
                <th className="py-2 pr-4 font-normal">Item</th>
                <th className="py-2 pr-4 font-normal">Fit</th>
                <th className="py-2 pr-4 font-normal">Qty</th>
                <th className="py-2 pr-4 font-normal">Unit</th>
                <th className="py-2 font-normal">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="py-2 pr-4">
                    {item.product.name}
                    {/* WHICH OPTION. A Floor Mats order that does not say which layer
                        was bought is an order nobody can fulfill correctly. Null on a
                        single-option product, which is most of the catalogue. */}
                    {item.variation && (
                      <span className="block text-[11px] text-accent">
                        {item.variation.name || item.variation.slug}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-fg-muted">
                    {item.brandSnapshot} {item.modelSnapshot}
                    <span className="block font-mono text-[11px] text-accent-dim">
                      {item.yearSnapshot}
                      {item.rows ? ` · ${item.rows}-row` : ""}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm">{item.qty}</td>
                  <td className="py-2 pr-4 font-mono text-sm text-fg-muted">
                    {fmtNaira(item.unitPrice)}
                  </td>
                  <td className="py-2 font-mono text-sm text-accent">{fmtNaira(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* The money. Exactly the stored figures, in the order an invoice reads. */}
          <div className="mt-4 rounded-xl border border-border bg-surface/60 px-4 py-2">
            <div className="flex justify-between border-t border-border py-2 text-sm">
              <span className="text-fg-muted">Subtotal</span>
              <span className="font-mono">{fmtNaira(order.subtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-border py-2 text-sm">
              <span className="text-fg-muted">Delivery</span>
              <span className="font-mono">
                {order.shippingFee > 0 ? fmtNaira(order.shippingFee) : ZERO_FEE_LABEL}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between border-t border-border py-2 text-sm">
                <span className="text-fg-muted">Discount</span>
                <span className="font-mono">− {fmtNaira(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border py-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono text-accent">{fmtNaira(order.total)}</span>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-fg-muted">
            {order.paymentMethod === "prepay"
              ? "Prepay by transfer — the delivery fee was waived and the total reflects that."
              : "Pay on delivery."}
          </p>

          {/* ── The exact message the customer was handed ─────────────────── */}
          <h3 className="mt-8 font-display text-base font-semibold">The message</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            The exact text stored on this order, built from the server&apos;s own figures. Copy it to
            re-send, or open the customer&apos;s thread below.
          </p>
          <textarea
            readOnly
            value={order.whatsappMessage}
            rows={9}
            className="mt-3 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg/90 focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CopyButton text={order.whatsappMessage} />
            {threadLink ? (
              <a
                href={threadLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:border-accent hover:text-accent"
              >
                Open WhatsApp thread ↗
              </a>
            ) : (
              <span className="text-[11px] text-fg-muted">
                The stored number could not be turned into a WhatsApp link.
              </span>
            )}
          </div>
        </div>

        {/* ── RIGHT: who it is for, and the status control ───────────────── */}
        <div>
          <h3 className="font-display text-base font-semibold">Customer &amp; delivery</h3>
          <div className="mt-2 rounded-xl border border-border bg-surface/60 px-4 py-1">
            <Field label="Name">{order.customerName}</Field>
            <Field label="Phone">
              <span className="font-mono">{order.phone}</span>
            </Field>
            <Field label="Address">{order.address}</Field>
            <Field label="Zone">
              {order.locationName}
              <span className="block text-[11px] text-fg-muted">{order.locationEta}</span>
            </Field>
            <Field label="Placed">
              <span className="font-mono text-xs">{TIMESTAMP.format(order.createdAt)}</span>
            </Field>
          </div>

          <h3 className="mt-8 font-display text-base font-semibold">Status</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            What you record about this order. It does not assert a payment — whether money arrived is
            a separate fact.
          </p>

          <form method="post" action={setOrderStatus} className="mt-3">
            <input type="hidden" name="orderId" value={order.id} />
            <fieldset className="space-y-2">
              <legend className="sr-only">Order status</legend>
              {ORDER_STATUSES.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    selectedStatus === value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface/60 hover:border-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={value}
                    defaultChecked={selectedStatus === value}
                    className="mt-1 accent-gold"
                  />
                  <span>
                    <span className="block text-sm font-medium">{orderStatusLabel(value)}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                      {orderStatusHint(value)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="mt-4 block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                Note (optional, kept in the audit log)
              </span>
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                placeholder="Why this changed — e.g. “customer cancelled, no stock in 3-row”"
                className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
              />
            </label>

            <button
              type="submit"
              className="mt-3 rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
            >
              Save status
            </button>
          </form>

          {attribution.length > 0 && (
            <details className="mt-6 rounded-xl border border-border bg-surface/60">
              <summary className="cursor-pointer px-4 py-3 text-sm text-fg/85 marker:content-none">
                Where it came from
              </summary>
              <div className="border-t border-border px-4 py-1">
                {attribution.map((entry) => (
                  <Field key={entry.label} label={entry.label}>
                    <span className="break-all font-mono text-xs">{entry.value}</span>
                  </Field>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
