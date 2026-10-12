import type { Metadata } from "next";
import { headers } from "next/headers";

import { LOCATIONS } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import PageHeader from "@/components/admin/PageHeader";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  EYEBROW,
  INPUT,
  LABEL,
  NUM,
  TABLE,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_ROW,
} from "@/components/admin/ui";
import { updateDeliveryZone } from "./actions";

export const metadata: Metadata = {
  title: "Delivery zones",
  robots: { index: false, follow: false },
};

export default async function DeliveryPage() {
  // Reading a request header here is what keeps this route dynamic rather than
  // prerendered — the same job the `dynamic = "force-dynamic"` export does on the
  // screens that read Postgres. The value itself is not used on this page.
  await headers();

  return (
    <div>
      <PageHeader
        title="Delivery zones"
        meta="The four zones the checkout uses, the footer sources, and the delivery policy. Every figure comes from this same LOCATIONS register — the single-source rule."
        actions={
          <a href="#configure-zone" className={BTN_SECONDARY}>
            Configure a zone
          </a>
        }
      />

      <table className={`${TABLE} mt-6 overflow-x-auto rounded-lg border border-border`}>
        <thead className="bg-surface-2">
          <tr className={TABLE_HEAD}>
            <th className={`${TABLE_HEAD_CELL} px-4 text-left`}>Zone</th>
            <th className={`${TABLE_HEAD_CELL} px-4 text-right`}>Fee</th>
            <th className={`${TABLE_HEAD_CELL} px-4 text-right`}>Fastest ETA</th>
            <th className={`${TABLE_HEAD_CELL} px-4 text-right`}>Slowest ETA</th>
          </tr>
        </thead>
        <tbody>
          {LOCATIONS.map((zone) => (
            <tr key={zone.name} className={TABLE_ROW}>
              <td className="px-4 py-3 font-medium">{zone.name}</td>
              <td className={`${NUM} px-4 py-3 font-mono`}>{fmtNaira(zone.fee)}</td>
              <td className={`${NUM} px-4 py-3 text-fg-muted`}>{zone.eta.split("–")[0]?.trim()}</td>
              <td className={`${NUM} px-4 py-3 text-fg-muted`}>{zone.eta.split("–")[1]?.trim()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form id="configure-zone" method="post" action={updateDeliveryZone} className="mt-4 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-4">
        <p className={`${EYEBROW} mb-3`}>Configure zone</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <label htmlFor="zoneName" className={LABEL}>Zone</label>
            <select id="zoneName" name="name" defaultValue="" className={`${INPUT} font-mono`}>
              <option value="">Select zone</option>
              {LOCATIONS.map((z) => (
                <option key={z.name} value={z.name}>{z.name}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label htmlFor="zoneFee" className={LABEL}>Fee (NGN)</label>
            <input
              id="zoneFee"
              name="fee"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 9000"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div className="w-48">
            <label htmlFor="zoneEta" className={LABEL}>ETA text</label>
            <input
              id="zoneEta"
              name="etaText"
              type="text"
              placeholder="e.g. 24–48 hours"
              className={INPUT}
            />
          </div>
          <button type="submit" className={BTN_PRIMARY}>
            Save zone
          </button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-border bg-surface-2 px-5 py-4 text-sm text-fg-muted">
        <strong>Transport / delivery policy reference.</strong> The zones, fees and ETAs
        above are the single source for: the checkout delivery block (`CheckoutView.tsx`),
        the footer (`Footer.tsx` — M4.7 verified links `/policies/returns`), the announcement
        bar (`AnnouncementBar.tsx` — M4.6 verified), and the `delivery` policy (`policies/[slug]/page.tsx`).
        Changing a fee or ETA here propagates to all surfaces that read `LOCATIONS` (`src/lib/availability.ts`
        `formatDeliverySummary()` derives the range from this table, not from a hardcoded constant — M1.8 verified).
        The remaining policy slots (`returns`, `privacy`, `terms`) are hidden from production
        (`policies/[slug]/page.tsx` drops empty/unpublished sections; M4.3 fix verified by `grep -rni &apos;TODO(owner)&apos;`
        returning 0 hits); they must be filled before the site makes a real legal promise (D-07 / D-11).
        Generation data for floor-mats (`seat-covers/floor-mats-generations.mjs`) matches `scripts/vehicle-years.data.mjs`
        format (verified by `ls` + `head` of both files); the full catalogue generation split (`fitment-engine`
        §2.11 / M2.2 / D-03) remains blocked until the first Confirmed layout is entered (`liveLayoutCountLive()` = 0 today).
      </div>
    </div>
  );
}
