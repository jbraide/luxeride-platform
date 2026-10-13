import Link from "next/link";

import { announcement } from "@/lib/copy";
import { loadPromotions } from "@/lib/discounts-server";
import { listDeliveryZones } from "@/lib/delivery";

/**
 * The announcement / utility bar (`trust-and-policies` §7.1–7.3).
 *
 * A Server Component, rendered above the header and NOT sticky, so the existing
 * `sticky top-0 z-20` header needs no offset change. The glyph is decorative and marked
 * `aria-hidden`, and no meaning is carried by colour alone.
 *
 * ── THE OFFER IS READ FROM THE DATABASE, NOT TYPED HERE ─────────────────────
 *
 * The owner's ask, 2026-10-05: "the announcement can see it at the top". So the first
 * item is whatever promotion is live, pulled from `Promotion`, and it disappears when
 * the promotion is switched off or its window closes — with nothing to edit in a
 * component.
 *
 * That is also most of the SEASONAL SWITCH: a Black Friday promotion appears here, in
 * the homepage hero band, and as a badge on every product card, from one row and one
 * date range. Before this the bar said three fixed sentences forever.
 *
 * ── WHAT IT STILL WILL NOT DO ────────────────────────────────────────────────
 *
 * No countdown, no "3 left", no urgency claim. `trust-and-policies` §7.3 rules those
 * out and they are what make a shop's numbers stop meaning anything. The offer is a
 * fact with a date range attached, not pressure.
 */
export default async function AnnouncementBar() {
  const promotions = await loadPromotions();
  // The "fastest zones" window is the owner's, so it is read from the live zones rather
  // than a compile-time constant that a fee change could not reach.
  const zones = await listDeliveryZones();
  const now = new Date();

  // Only what is actually RUNNING. A scheduled or ended promotion does not appear, so
  // the bar can never advertise something the customer cannot use.
  const live = promotions.find(
    (rule) =>
      rule.label &&
      (rule.startsAt === null || rule.startsAt <= now) &&
      (rule.endsAt === null || rule.endsAt >= now),
  );

  // BADGE AND LABEL ONLY — the short form. The bar is one line at 11px; a seasonal
  // headline there is a sentence in a strip, and a campaign owned landing page already
  // carries the long one. This also stops "CHRISTMAS 10% OFF - Christmas: Christmas:"
  // when a headline is written to stand alone.
  const offerItem = live ? [live.badge, live.label].filter(Boolean).join(" \u2014 ") : null;

  const items = [offerItem, announcement.delivery, announcement.fastest(zones), announcement.prepay].filter(
    (item): item is string => Boolean(item),
  );

  return (
    <div className="border-b border-border bg-surface/60">
      <ul className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-5 py-2 text-center font-mono text-[11px] text-accent-dim sm:flex-row sm:justify-center sm:gap-5">
        {items.map((item, index) => (
          <li key={item} className="flex items-center justify-center gap-2">
            <span aria-hidden className={index === 0 ? "text-accent" : "text-accent/60"}>
              {index === 0 ? "\u25c6" : "\u25c7"}
            </span>
            {/* The live offer links to the shop. The fixed copy does not \u2014 a delivery
                statement is not a destination. */}
            {index === 0 ? (
              <Link href="/shop" className="text-accent underline-offset-4 hover:underline">
                {item}
              </Link>
            ) : (
              <span>{item}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
