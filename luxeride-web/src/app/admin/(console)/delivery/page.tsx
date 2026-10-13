import type { Metadata } from "next";

import { listDeliveryZones } from "@/lib/delivery";
import { fmtNaira } from "@/lib/pricing";
import EmptyState from "@/components/admin/EmptyState";
import PageHeader from "@/components/admin/PageHeader";
import {
  BTN_PRIMARY,
  BTN_ROW,
  BTN_SECONDARY,
  EYEBROW,
  INPUT,
  LABEL,
  SECTION_HINT,
  SECTION_TITLE,
} from "@/components/admin/ui";
import { messageFor } from "../confirm-guard";
import { bulkSetDeliveryFee, deleteDeliveryZone, saveDeliveryZone } from "./actions";

export const metadata: Metadata = {
  title: "Delivery zones",
  robots: { index: false, follow: false },
};

/**
 * `/admin/delivery` — the delivery zones, and the ONLY place a fee is set.
 *
 * Every figure here is a `Location` row. The checkout, the delivery policy, the contact
 * page and the PDP's delivery line all read the same rows (`src/lib/delivery.ts`), so a
 * fee changed here is the fee charged — which was not true before: this screen validated
 * against a compile-time constant and wrote nothing, while `/api/orders` charged from
 * the table.
 *
 * THE BULK BAR IS THE POINT OF THE REDESIGN. The owner's ask was "assign an amount to
 * multiple places at once when I select them". So the checkboxes belong to a form that
 * is NOT their ancestor — `form={bulkFormId}` — which is what lets each zone ALSO carry
 * its own edit form without nesting one form inside another (illegal, and the classic
 * reason a one-click control silently stops working).
 *
 * No `'use client'`: every control is a plain form, and the refusal rides in the URL.
 */
export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorCode = typeof params.e === "string" ? params.e : "";
  const zones = await listDeliveryZones();

  // One id, referenced by every checkbox. The bulk form itself is rendered above the
  // list rather than wrapping it, so the per-zone forms below can exist at all.
  const bulkFormId = "bulk-delivery-form";

  return (
    <div>
      <PageHeader
        title="Delivery zones"
        meta="What delivery costs and how long it takes, per zone. These are the figures the checkout charges, the delivery policy publishes and the contact page lists — change one here and all of them follow."
        actions={
          <a href="#add-zone" className={BTN_SECONDARY}>
            Add a zone
          </a>
        }
      />

      {errorCode && (
        <p role="alert" className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {messageFor(errorCode)}
        </p>
      )}

      {zones.length === 0 ? (
        <EmptyState className="mt-6">
          No delivery zones yet. Add the first one below — until a zone exists, checkout cannot
          offer delivery and every order would be refused.
        </EmptyState>
      ) : (
        <>
          {/*
            THE BULK BAR. It is its own form so the checkboxes in the list can point at it
            by id, and it is FIRST because "set a fee on several zones" is the job this
            screen was rebuilt for.
          */}
          <form
            id={bulkFormId}
            method="post"
            action={bulkSetDeliveryFee}
            className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-4"
          >
            <p className={`${EYEBROW} w-full`}>Set one fee on several zones</p>
            <div className="w-40">
              <label htmlFor="bulkFee" className={LABEL}>
                Fee (₦)
              </label>
              <input
                id="bulkFee"
                name="bulkFee"
                type="number"
                inputMode="numeric"
                placeholder="e.g. 9000"
                className={`${INPUT} font-mono`}
              />
            </div>
            <div className="w-48">
              <label htmlFor="bulkEta" className={LABEL}>
                Window (optional)
              </label>
              <input id="bulkEta" name="bulkEta" placeholder="leave blank to keep" className={INPUT} />
            </div>
            <button type="submit" className={BTN_PRIMARY}>
              Apply to selected
            </button>
            <p className={`${SECTION_HINT} w-full`}>
              Tick the zones below, then set one fee for all of them. Leave the window blank to change
              only the fee.
            </p>
          </form>

          <ul className="mt-4 space-y-2">
            {zones.map((zone) => (
              <li key={zone.id} className="rounded-xl border border-border bg-surface/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <input
                    type="checkbox"
                    name="zoneIds"
                    value={zone.id}
                    form={bulkFormId}
                    aria-label={`Select ${zone.name} for a bulk fee`}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="font-medium text-fg/90">{zone.name}</span>
                  <span className="font-mono text-sm text-accent">{fmtNaira(zone.fee)}</span>
                  <span className="text-xs text-fg-muted">{zone.eta}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                    {zone.slug}
                  </span>
                </div>

                <form method="post" action={saveDeliveryZone} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={zone.id} />
                  <div className="w-56">
                    <label htmlFor={`name-${zone.id}`} className={LABEL}>
                      Name
                    </label>
                    <input id={`name-${zone.id}`} name="name" defaultValue={zone.name} className={INPUT} />
                  </div>
                  <div className="w-36">
                    <label htmlFor={`fee-${zone.id}`} className={LABEL}>
                      Fee (₦)
                    </label>
                    <input
                      id={`fee-${zone.id}`}
                      name="fee"
                      type="number"
                      inputMode="numeric"
                      defaultValue={zone.fee}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                  <div className="w-44">
                    <label htmlFor={`eta-${zone.id}`} className={LABEL}>
                      Window
                    </label>
                    <input id={`eta-${zone.id}`} name="etaText" defaultValue={zone.eta} className={INPUT} />
                  </div>
                  <button type="submit" className={BTN_PRIMARY}>
                    Save
                  </button>
                  {/* A separate form is unnecessary here — `formAction` overrides the
                      save, and `formNoValidate` keeps the browser from validating the
                      fields above on a one-click delete. */}
                  <button
                    type="submit"
                    formAction={deleteDeliveryZone}
                    formNoValidate
                    title={`Remove ${zone.name}. Refused if any order was delivered to it.`}
                    className={`${BTN_ROW} hover:border-danger hover:text-danger`}
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}

      <section id="add-zone" className="mt-8">
        <h2 className={SECTION_TITLE}>Add a zone</h2>
        <p className={SECTION_HINT}>
          A zone is a place with one fee and one window. The name is what the customer picks at
          checkout and what an order records, so keep it recognisable.
        </p>

        <form
          method="post"
          action={saveDeliveryZone}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-4"
        >
          <div className="w-56">
            <label htmlFor="new-zone-name" className={LABEL}>
              Name
            </label>
            <input id="new-zone-name" name="name" required placeholder="e.g. Kaduna & Kano" className={INPUT} />
          </div>
          <div className="w-36">
            <label htmlFor="new-zone-fee" className={LABEL}>
              Fee (₦)
            </label>
            <input
              id="new-zone-fee"
              name="fee"
              type="number"
              inputMode="numeric"
              required
              placeholder="e.g. 14000"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div className="w-44">
            <label htmlFor="new-zone-eta" className={LABEL}>
              Window
            </label>
            <input id="new-zone-eta" name="etaText" required placeholder="e.g. 4–6 days" className={INPUT} />
          </div>
          <button type="submit" className={BTN_PRIMARY}>
            Add zone
          </button>
        </form>
      </section>

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-fg-muted">
        Deleting is refused while an order points at a zone, because the order carries the zone it was
        promised. Change its fee to ₦0 instead, or rename it. Every change here is written to the audit
        log.
      </p>
    </div>
  );
}
