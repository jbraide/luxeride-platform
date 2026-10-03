import type { Metadata } from "next";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { isOrderRef } from "@/lib/order-ref";
import { fmtNaira } from "@/lib/pricing";
import { ZERO_FEE_LABEL } from "@/lib/order-pricing";
import { whatsappLink, recoveryMessage } from "@/lib/whatsapp";
import { contact } from "@/lib/copy";
import { accessCookieName, digestsMatch, phoneDigest } from "./access";
import OrderAccessForm from "./OrderAccessForm";

/**
 * `/order/<reference>` — the order record, read from the database.
 * `commerce-backend` §7.1–7.4, at `master-build-plan` M6.11.
 *
 * WHY THIS REPLACES THE `localStorage` RECEIPT
 *
 * `src/app/order/confirmation` read a zustand store the customer's own browser
 * held. That is not a record: clearing site data loses it, a second device shows
 * nothing, and the owner cannot read it at all. This page reads `Order` and
 * `OrderItem` rows by reference, which is the one thing all three of those
 * share — the order is findable, it outlives the customer's phone, and the
 * reference they were handed is the key to it.
 *
 * WHY THE MONEY LINES ARE BEHIND A PHONE NUMBER
 *
 * `Order.reference` is a secret. The owner quotes it on WhatsApp, it ends up in
 * a screenshot, and 50 bits is a lot less unguessable when someone is actively
 * trying to guess it. So the itemised lines, the fee, the discount, the total —
 * and above all the address and the phone number — render only once this browser
 * has presented the number the order was placed with. `§7.2`: "a form posts the
 * phone, a server action compares it to the stored `Order.phone` and sets an
 * httpOnly cookie scoped to that one reference."
 *
 * WHAT "DISCLOSE NOTHING" MEANS HERE, PRECISELY
 *
 * `commerce-backend` § Error Handling: "Reference matches but phone does not |
 * identical 'not found' response; nothing disclosed." So there is exactly ONE
 * unverified rendering, and both cases reach it:
 *
 *   - a reference that does not exist
 *   - a reference that exists, with no cookie, a stale one, or a wrong phone
 *
 * `notFound()` is deliberately NOT called: §7.3 asks for "a plain 'Order not
 * found' state — not an error". And because the unverified page is identical in
 * both cases, its neutral copy is safe either way: it says nothing about whether
 * the reference is real, because from the outside the page cannot tell.
 *
 * WHY THE REFERENCE IS NOT CACHED ANYWHERE ELSE
 *
 * §7.3: "The order reference is a secret: never place it in page source, a log
 * line, or a URL the customer is likely to screenshot." This route necessarily
 * carries it — it is the key — so the two things that are NOT done here are the
 * two that would leak it: it is not written into any `console` line, and it is
 * not put in `metadata`, `robots`, the sitemap or an Open Graph card.
 */

/**
 * `noindex`, and no `description`.
 *
 * The same reasoning `/order/confirmation` carries, restated because this route
 * replaced it: an order page has nothing to describe to a crawler, and
 * `description: null` stops it inheriting the root layout's laser-mats sentence —
 * Next merges metadata per field, so an omitted description is inherited and
 * only an explicit `null` drops it.
 */
export const metadata: Metadata = {
  title: "Your Order",
  description: null,
  robots: { index: false, follow: false },
};

/**
 * The order as this page renders it.
 *
 * Deliberately NOT the Prisma row. §6.5's rule — return what the UI renders,
 * never a raw record — applies to a Server Component exactly as it does to an
 * action: the client receives HTML, and every value in it is named here.
 */
interface ViewOrder {
  reference: string;
  createdAt: string;
  paymentMethod: string;
  locationName: string;
  locationEta: string;
  shippingFee: number;
  subtotal: number;
  discount: number;
  total: number;
  whatsappMessage: string;
  lines: {
    key: string;
    productName: string;
    brand: string;
    model: string;
    year: number;
    rows: string | null;
    qty: number;
    lineTotal: number;
  }[];
}

export default async function OrderReferencePage({
  params,
}: {
  // Next 16: `params` is a Promise on both pages and route handlers.
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  // A string that is not the shape `mintOrderRef()` produces is never looked up.
  // Not because an unindexed lookup would be expensive — `reference` is
  // `@unique` — but because "not a reference" and "not an order" must be the
  // same answer, and refusing to try is the cheapest way to guarantee that.
  const order = isOrderRef(reference)
    ? await prisma.order.findUnique({
        where: { reference },
        include: {
          items: {
            orderBy: { id: "asc" },
            include: { product: { select: { name: true } } },
          },
        },
      })
    : null;

  // `locationName` and `locationEta` come from the ORDER's own snapshot, not
  // from the live `Location` row: a later edit to a zone's name or estimate must
  // not rewrite what this order was quoted or what was owed. The same reason the
  // fee is snapshotted.
  const view: ViewOrder | null = order
    ? {
        reference: order.reference,
        createdAt: order.createdAt.toISOString(),
        paymentMethod: order.paymentMethod,
        locationName: order.locationName,
        locationEta: order.locationEta,
        shippingFee: order.shippingFee,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        whatsappMessage: order.whatsappMessage,
        lines: order.items.map((item) => ({
          key: item.id,
          // `OrderItem` snapshots the brand, model and year but not the product
          // NAME, so the name is read through the foreign key. A rename there is
          // cosmetic; the money and the car stay frozen on the line, which is
          // what §7.3 asks for.
          productName: item.product.name,
          brand: item.brandSnapshot,
          model: item.modelSnapshot,
          year: item.yearSnapshot,
          rows: item.rows,
          qty: item.qty,
          lineTotal: item.lineTotal,
        })),
      }
    : null;

  const cookieStore = await cookies();
  const presented = cookieStore.get(accessCookieName(reference))?.value;
  const verified =
    view !== null &&
    typeof presented === "string" &&
    order !== null &&
    digestsMatch(presented, phoneDigest(order.phone));

  // ── Unverified: the SAME page for a wrong phone and for no order ─────────────
  //
  // This block is reached by three inputs — an unknown reference, a real one with
  // no cookie, and a real one whose cookie has expired — and it must render
  // identically for all three. Anything that varies between them is a disclosure
  // about which references exist, which is the one thing `§7.3` forbids.
  if (!view || !verified) {
    return (
      <div className="mx-auto max-w-xl px-5 py-14">
        <h1 className="font-display text-2xl font-semibold">We could not open that order</h1>
        <p className="mt-2 text-sm text-muted">
          Enter the WhatsApp number the order was placed with and we will show you the receipt. If the
          reference does not match an order, we will say so here rather than guess.
        </p>

        {/* Echoed back because the CUSTOMER supplied it and it is their own
            order handle. Nothing else on this page derives from it. */}
        <p className="mt-5 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-sm text-gold">
          {reference}
        </p>

        {/* The form is rendered for BOTH cases, and that is the privacy property
            rather than an inconvenience. §7.3 and § Error Handling ask for an
            "identical 'not found' response; nothing disclosed", so an unknown
            reference and an unverified one must produce the SAME page — and the
            one control that would differ is this form. Rendering it only when an
            order exists turns the page into an oracle: guess a reference, see
            whether a box appears, and you have confirmed the reference is real
            without ever knowing the phone.

            `cart-checkout` §11.3's "never render a lookup form that cannot
            succeed" is a different rule and does not conflict: it is scoped to
            "WHILE no server-side order store exists", and one does. This form
            succeeds — for every real reference, as soon as the number is right. */}
        <div className="mt-6">
          <OrderAccessForm reference={reference} />
        </div>

        {/* Requirement 11.3: an unknown reference routes the customer to
            WhatsApp rather than showing any other order's data. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={whatsappLink(recoveryMessage(reference))}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-xl bg-gold px-5 py-3.5 text-sm font-semibold text-ink sm:w-auto"
          >
            Ask us on WhatsApp
          </a>
          <a
            href={contact.tel}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/25 px-5 py-3.5 text-sm font-semibold hover:border-gold hover:text-gold sm:w-auto"
          >
            Call {contact.whatsappNumber}
          </a>
        </div>
      </div>
    );
  }

  // ── Verified: the money lines, from the persisted columns ───────────────────
  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <h1 className="font-display text-2xl font-semibold">Your order</h1>
      <p className="mt-2 text-sm text-muted">
        We have this order on file. We confirm every order on WhatsApp before dispatch, and we cannot see
        WhatsApp from here — so if you have not sent the message yet, that is the next step.
      </p>

      <p className="mt-5 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-sm text-gold">
        {view.reference}
      </p>

      <div className="mt-5 space-y-2 rounded-xl border border-line bg-panel p-5">
        {view.lines.map((line) => (
          <div key={line.key} className="flex justify-between text-sm">
            <span>
              {line.qty}x {line.productName} — {line.year} {line.brand} {line.model}
              {line.rows ? ` (${line.rows}-Row)` : ""}
            </span>
            <span className="font-mono text-gold">{fmtNaira(line.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-white/15 pt-2 text-sm">
          <span className="text-muted">
            Delivery ({view.locationName}) — {view.locationEta}
          </span>
          <span className="font-mono">
            {view.shippingFee > 0 ? fmtNaira(view.shippingFee) : ZERO_FEE_LABEL}
          </span>
        </div>
        {view.discount > 0 && (
          <div className="flex justify-between text-sm text-gold">
            <span>Prepay discount</span>
            <span className="font-mono">-{fmtNaira(view.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-white/15 pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="font-mono text-gold">{fmtNaira(view.total)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Estimated arrival: {view.locationEta} after confirmation.{" "}
        {view.paymentMethod === "prepay"
          ? "Pay by bank transfer — the discount above applies once the transfer is received."
          : "Pay on delivery — the rider collects when the order arrives."}
      </p>

      {/* §6.1 / §7.4: re-open the conversation with the SAME message, read back
          off the order rather than rebuilt, so what the customer sends now is
          character-for-character what they sent the first time. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappLink(view.whatsappMessage)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-xl bg-gold px-5 py-3.5 text-sm font-semibold text-ink sm:w-auto sm:px-8"
        >
          Re-open on WhatsApp
        </a>
        <a
          href={contact.tel}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/25 px-5 py-3.5 text-sm font-semibold hover:border-gold hover:text-gold sm:w-auto"
        >
          Call us
        </a>
      </div>

      <p className="mt-6 text-center text-xs text-muted">Placed {view.createdAt}.</p>
    </div>
  );
}