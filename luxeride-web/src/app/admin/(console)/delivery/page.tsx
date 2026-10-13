import type { Metadata } from "next";

import { listDeliveryZonesForAdmin, type AdminDeliveryZone } from "@/lib/delivery";
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
import SubmitButton from "@/components/admin/SubmitButton";
import {
  bulkSetDeliveryFee,
  deleteDeliveryZone,
  saveDeliveryZone,
  setDeliveryZoneActive,
} from "./actions";

export const metadata: Metadata = {
  title: "Delivery",
  robots: { index: false, follow: false },
};

/**
 * `/admin/delivery` — the delivery fees, state by state, and the ONLY place a fee is set.
 *
 * Every figure here is a `Location` row, one per Nigerian state. The checkout, the cart,
 * the delivery policy, the contact page, the PDP delivery line and the fee band all read
 * the same rows (`src/lib/delivery.ts`), so a fee changed here is the fee charged — which
 * was not true before: this screen validated against a compile-time constant and wrote
 * nothing, while `/api/orders` charged from the table.
 *
 * THE BULK BAR IS THE POINT. The owner's ask was "assign an amount to multiple states at
 * once". So there are two ways to choose them: tick the boxes beside the states and press
 * "Apply to selected", or press "Apply to all states" to set one fee nationwide. The
 * checkboxes work by pointing at a form that is NOT their ancestor — `form={bulkFormId}` —
 * which is what lets each state ALSO carry its own edit form without nesting one form
 * inside another (illegal, and the classic reason a one-click control silently stops
 * working).
 *
 * A WITHDRAWN STATE stays on the orders that point at it and leaves every customer-facing
 * figure. That is why there are two lists: the menu, and the withdrawn rows kept for their
 * history (see `setDeliveryZoneActive`).
 *
 * No `'use client'`: every control is a plain form, and a refusal rides in the URL, where
 * the console's corner alert (`AdminToast`) reads it back.
 */
export default async function DeliveryPage() {
  const zones = await listDeliveryZonesForAdmin();

  const onMenu = zones.filter((zone) => zone.active);
  const withdrawn = zones.filter((zone) => !zone.active);

  // One id, referenced by every checkbox. The bulk form itself is rendered above the
  // list rather than wrapping it, so the per-state forms below can exist at all.
  const bulkFormId = "bulk-delivery-form";

  return (
    <div>
      <PageHeader
        title="Delivery"
        meta="What delivery costs, state by state. These are the figures the checkout charges, the delivery policy publishes and the contact page lists — change a fee here and all of them follow. Tune the whole country at once from the bulk bar."
        actions={
          <a href="#add-zone" className={BTN_SECONDARY}>
            Add a state
          </a>
        }
      />

      {onMenu.length === 0 ? (
        <EmptyState className="mt-6">
          No states are on the menu. Until at least one is, checkout cannot offer delivery
          and every order would be refused. Add one below, or restore a withdrawn state.
        </EmptyState>
      ) : (
        <>
          {/*
            THE BULK BAR. It is its own form so the checkboxes in the list can point at it
            by id, and it is FIRST because "set a fee across several states" is the job
            this screen was rebuilt for.
          */}
          <form
            id={bulkFormId}
            method="post"
            action={bulkSetDeliveryFee}
            className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-4"
          >
            <p className={`${EYEBROW} w-full`}>Set one fee on many states</p>
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
            <SubmitButton className={BTN_PRIMARY}>
              Apply to selected
            </SubmitButton>
            <SubmitButton
              name="scope"
              value="all"
              className={BTN_SECONDARY}
              title={`Set this fee on all ${onMenu.length} states on the menu`}
            >
              Apply to all {onMenu.length} states
            </SubmitButton>
            <p className={`${SECTION_HINT} w-full`}>
              Tick states below and press <strong>Apply to selected</strong>, or press{" "}
              <strong>Apply to all {onMenu.length} states</strong> to set one nationwide price. Leave the
              window blank to change only the fee; a fee that is already correct is left alone.
            </p>
          </form>

          <ul className="mt-4 space-y-2">
            {onMenu.map((zone) => (
              <ZoneRow key={zone.id} zone={zone} bulkFormId={bulkFormId} />
            ))}
          </ul>
        </>
      )}

      {withdrawn.length > 0 && (
        <section className="mt-10">
          <h2 className={SECTION_TITLE}>Withdrawn ({withdrawn.length})</h2>
          <p className={SECTION_HINT}>
            Off the checkout and off every published figure, but kept because orders point at them.
            Restore one to put it back on the menu, or delete it if no order ever used it.
          </p>
          <ul className="mt-4 space-y-2">
            {withdrawn.map((zone) => (
              <li
                key={zone.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface/40 px-4 py-3"
              >
                <span className="font-medium text-fg-muted">{zone.name}</span>
                <span className="font-mono text-sm text-fg-muted">{fmtNaira(zone.fee)}</span>
                <span className="text-xs text-fg-muted">{zone.eta}</span>
                <div className="ml-auto flex items-center gap-2">
                  <form method="post" action={setDeliveryZoneActive}>
                    <input type="hidden" name="id" value={zone.id} />
                    <input type="hidden" name="active" value="true" />
                    <SubmitButton className={BTN_ROW}>
                      Restore
                    </SubmitButton>
                  </form>
                  <form method="post" action={deleteDeliveryZone}>
                    <input type="hidden" name="id" value={zone.id} />
                    <SubmitButton
                      className={`${BTN_ROW} hover:border-danger hover:text-danger`}
                      title={`Delete ${zone.name} for good. Refused if any order points at it.`}
                    >
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="add-zone" className="mt-8">
        <h2 className={SECTION_TITLE}>Add a state</h2>
        <p className={SECTION_HINT}>
          A state is a place with one fee and one window. The name is what the customer picks at
          checkout and what an order records, so keep it recognisable — the 36 states and the FCT are
          already here, so this is normally only needed if a name was deleted by mistake.
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
            <input id="new-zone-name" name="name" required placeholder="e.g. Lagos" className={INPUT} />
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
              placeholder="e.g. 4000"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div className="w-44">
            <label htmlFor="new-zone-eta" className={LABEL}>
              Window
            </label>
            <input id="new-zone-eta" name="etaText" required placeholder="e.g. 24–48 hours" className={INPUT} />
          </div>
          <SubmitButton className={BTN_PRIMARY}>
            Add state
          </SubmitButton>
        </form>
      </section>

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-fg-muted">
        Deleting is refused while an order points at a state, because the order carries the state it
        was promised. That is what <strong>Withdraw</strong> is for — it takes a state off the checkout
        without touching its orders. Every change here is written to the audit log.
      </p>
    </div>
  );
}

/** One state on the menu: its figures, its own edit form, and its withdraw/delete controls. */
function ZoneRow({ zone, bulkFormId }: { zone: AdminDeliveryZone; bulkFormId: string }) {
  return (
    <li className="rounded-xl border border-border bg-surface/60 px-4 py-3">
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
        <SubmitButton className={BTN_PRIMARY}>
          Save
        </SubmitButton>
        {/* `formAction` overrides the save, and `formNoValidate` keeps the browser from
            validating the fields above on a one-click control. The button carries its own
            `name`/`value`, which is how the withdraw state reaches the action. */}
        <SubmitButton
          name="active"
          value="false"
          formAction={setDeliveryZoneActive}
          formNoValidate
          title={`Withdraw ${zone.name} from the checkout. Its orders are kept.`}
          className={BTN_ROW}
        >
          Withdraw
        </SubmitButton>
        <SubmitButton
          formAction={deleteDeliveryZone}
          formNoValidate
          title={`Delete ${zone.name} for good. Refused if any order points at it.`}
          className={`${BTN_ROW} hover:border-danger hover:text-danger`}
        >
          Delete
        </SubmitButton>
      </form>
    </li>
  );
}
