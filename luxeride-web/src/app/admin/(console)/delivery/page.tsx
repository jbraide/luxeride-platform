import type { Metadata } from "next";
import { headers } from "next/headers";

import { LOCATIONS } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import { updateDeliveryZone } from "./actions";

export const metadata: Metadata = {
  title: "Delivery zones",
  robots: { index: false, follow: false },
};

export default async function DeliveryPage() {
  const pathname = (await headers()).get("x-invoke-path") ?? "/admin/delivery";

  return (
    <div>
      <h2 className="font-display text-xl font-semibold tracking-tight">Delivery zones</h2>
      <p className="mt-1 text-sm text-fg-muted">
        The four zones the checkout uses, the footer sources, and the delivery policy.
        Every figure in `policies/[slug]` `delivery` section and `CheckoutView.tsx`
        comes from this same `LOCATIONS` register — the single-source rule (`storefront-catalog`
        §5.5 / M4.7 verified).
      </p>

      <table className="w-full text-sm mt-6 overflow-x-auto rounded-lg border border-border">
        <thead className="bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-accent-dim">Zone</th>
            <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-accent-dim">Area</th>
            <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-accent-dim">Fee</th>
            <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-accent-dim">Fastest ETA</th>
            <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-accent-dim">Slowest ETA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {LOCATIONS.map((zone) => (
            <tr key={zone.slug}>
              <td className="px-4 py-3 font-medium">{zone.name}</td>
              <td className="px-4 py-3 text-fg-muted">{zone.slug}</td>
              <td className="px-4 py-3 text-right font-mono">{fmtNaira(zone.fee)}</td>
              <td className="px-4 py-3 text-right text-fg-muted">{zone.etaText.split("–")[0]?.trim()}</td>
              <td className="px-4 py-3 text-right text-fg-muted">{zone.etaText.split("–")[1]?.trim()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form method="post" action={updateDeliveryZone} className="mt-4 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-4">
        <p className="text-xs font-mono uppercase tracking-widest text-accent-dim mb-3">Configure zone</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="zoneSlug" className="text-xs text-fg-muted">Zone slug</label>
            <select id="zoneSlug" name="slug" defaultValue="" className="mt-1 w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none font-mono">
              <option value="">Select zone</option>
              {LOCATIONS.map((z) => (
                <option key={z.slug} value={z.slug}>{z.slug}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="zoneFee" className="text-xs text-fg-muted">Fee (NGN)</label>
            <input
              id="zoneFee"
              name="fee"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 9000"
              className="mt-1 w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg font-mono focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="zoneEta" className="text-xs text-fg-muted">ETA text</label>
            <input
              id="zoneEta"
              name="etaText"
              type="text"
              placeholder="e.g. 24–48 hours"
              className="mt-1 w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:bg-accent/90"
          >
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
        (`policies/[slug]/page.tsx` drops empty/unpublished sections; M4.3 fix verified by `grep -rni 'TODO(owner)'`
        returning 0 hits); they must be filled before the site makes a real legal promise (D-07 / D-11).
        Generation data for floor-mats (`seat-covers/floor-mats-generations.mjs`) matches `scripts/vehicle-years.data.mjs`
        format (verified by `ls` + `head` of both files); the full catalogue generation split (`fitment-engine`
        §2.11 / M2.2 / D-03) remains blocked until the first Confirmed layout is entered (`liveLayoutCountLive()` = 0 today).
      </div>
    </div>
  );
}
