import { LOCATIONS, WHATSAPP_NUMBER } from "@/data/locations";
import { fmtNaira } from "@/lib/pricing";
import { whatsappLink } from "@/lib/whatsapp";
import type { Policy } from "@/data/policies";

/**
 * Renders a `Policy` as a semantic `<article>`
 * (`storefront-catalog` §5.6). When `showZoneTable` is set (the delivery
 * policy) the zone table is built from `LOCATIONS`, so no fee or ETA is retyped
 * and the numbers cannot disagree with the checkout.
 *
 * ─── OWNER SLOTS ARE SOURCE, NOT COPY ────────────────────────────────────────
 *
 * `src/data/policies.ts` carries `[[OWNER INPUT REQUIRED: …]]` markers where the
 * owner has not yet committed to a position. Those are instructions to the
 * author, and they were being rendered verbatim — so a visitor checking whether
 * this business is legitimate read *"[[OWNER INPUT REQUIRED: define "swap"
 * operationally …]]"* on `/policies/returns`. On the trust pages, which is the
 * worst possible place for it.
 *
 * So the filter below is not cosmetic. A slot never reaches the page, a section
 * whose body was entirely slots is dropped rather than left as a bare heading,
 * and a policy with nothing published yet says so plainly and offers a human
 * instead of showing an empty shell.
 *
 * `scripts/check-placeholders.mjs` still fails while any slot remains in the
 * source — that is the pre-spend gate, and this is only the guarantee that the
 * gap is invisible rather than published.
 */

/** An authoring marker, never customer copy. */
const OWNER_SLOT = /\[\[OWNER INPUT REQUIRED:/;

export function isPublishedParagraph(paragraph: string): boolean {
  return !OWNER_SLOT.test(paragraph);
}

export default function PolicyPage({
  policy,
  showZoneTable = false,
}: {
  policy: Policy;
  showZoneTable?: boolean;
}) {
  const sections = policy.sections
    .map((section) => ({ ...section, body: section.body.filter(isPublishedParagraph) }))
    .filter((section) => section.body.length > 0);

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

      {sections.length > 0 ? (
        <div className="mt-8 space-y-7">
          {sections.map((section) => (
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
      ) : (
        // Nothing is published for this policy yet. Saying so plainly is worse for
        // nobody than an empty page, and far better than showing the authoring
        // markers — and the WhatsApp route is the same answer the rest of the site
        // gives when it cannot answer.
        <div className="mt-8 rounded-xl border border-line bg-panel/60 p-5">
          <h2 className="font-display text-lg font-semibold">This page is still being finalised</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            We would rather publish nothing here than something we cannot stand behind. Ask us
            directly and we will answer in writing.
          </p>
          <a
            href={whatsappLink(`Hi! I have a question about your ${policy.title.toLowerCase()} policy.`)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-xl border border-line bg-panel px-5 py-3 text-sm font-semibold text-gold hover:border-gold"
          >
            Ask us on WhatsApp
          </a>
        </div>
      )}

      {sections.length > 0 && sections.length < policy.sections.length && (
        <p className="mt-8 text-xs text-muted">
          Some answers on this page are still being written up. Message us on WhatsApp at{" "}
          <span className="font-mono text-gold-dim">+{WHATSAPP_NUMBER}</span> and we will answer
          directly.
        </p>
      )}
    </article>
  );
}
