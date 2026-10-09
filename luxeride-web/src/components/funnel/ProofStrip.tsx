import type { ProofStripProps } from "@/data/funnel/sections";

/**
 * Real customer statements, and nothing else.
 *
 * IT RENDERS `null` WHEN THERE ARE NO VERIFIED TESTIMONIALS, and that is the whole
 * point of the component (Requirement 3.2). There is no review store in this app, so
 * today it renders nothing on every page that uses it — which is the honest result.
 * A placeholder, a "reviews coming soon", or a count of happy drivers would be the
 * unearned social proof `trust-and-policies` 1.1 and 11.3 forbid, and the reason this
 * section is written to disappear rather than to fill.
 *
 * Only `verified: true` items are shown; an unverified entry is dropped rather than
 * rendered with a caveat.
 */
export default function ProofStrip({ items }: ProofStripProps) {
  const verified = items.filter((item) => item.verified);
  if (verified.length === 0) return null;

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2">
          {verified.map((item) => (
            <figure
              key={`${item.name}-${item.car}`}
              className="rounded-xl border border-border bg-surface/60 px-4 py-4"
            >
              <blockquote className="text-sm leading-relaxed text-fg/85">“{item.quote}”</blockquote>
              <figcaption className="mt-3 text-xs text-fg-muted">
                {item.name} — {item.car}
                {item.location ? `, ${item.location}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
