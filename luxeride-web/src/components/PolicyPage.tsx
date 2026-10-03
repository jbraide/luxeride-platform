import { LOCATIONS } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import type { Policy } from "@/data/policies";

/**
 * Renders a `Policy` as a semantic `<article>`
 * (`storefront-catalog` §5.6). When `showZoneTable` is set (the delivery
 * policy) the zone table is built from `LOCATIONS`, so no fee or ETA is retyped
 * and the numbers cannot disagree with the checkout.
 */
export default function PolicyPage({
  policy,
  showZoneTable = false,
}: {
  policy: Policy;
  showZoneTable?: boolean;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">{policy.title}</h1>
      <p className="mt-2 text-sm text-muted">{policy.summary}</p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-gold-dim">
        Last updated {policy.updatedAt}
      </p>

      {showZoneTable && (
        <div className="mt-6 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Zone</th>
                <th className="px-4 py-2 font-medium">Fee</th>
                <th className="px-4 py-2 font-medium">Window</th>
              </tr>
            </thead>
            <tbody>
              {LOCATIONS.map((zone) => (
                <tr key={zone.name} className="border-t border-line">
                  <td className="px-4 py-2">{zone.name}</td>
                  <td className="px-4 py-2 font-mono text-gold">{fmtNaira(zone.fee)}</td>
                  <td className="px-4 py-2 text-muted">{zone.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 space-y-7">
        {policy.sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="font-display text-lg font-semibold">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-sm leading-relaxed text-white/80">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
