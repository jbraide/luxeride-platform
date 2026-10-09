import type { FaqBlockProps } from "@/data/funnel/sections";

/**
 * The funnel pages' FAQ, on the `ProductFaq` pattern.
 *
 * `<details>`/`<summary>` rather than a React accordion: it opens without
 * JavaScript, it is keyboard-operable for free, and it works when a client bundle
 * fails to load — which is exactly when a visitor has the most questions and the
 * least patience (Requirement 2.4).
 *
 * An empty list renders nothing, the same rule `ProductFaq` follows: a "coming soon"
 * box where an answer should be is worse than no section (Requirement 9.3). The
 * heading id is fixed, so no page may render two of these.
 */
export default function FaqBlock({ items }: FaqBlockProps) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="funnel-faq-heading" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h2 id="funnel-faq-heading" className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
          Questions
        </h2>
        <div className="mt-3 divide-y divide-white/10 rounded-xl border border-border bg-surface/60">
          {items.map((entry) => (
            <details key={entry.q} className="group px-4 py-3">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium marker:content-none">
                <span>{entry.q}</span>
                <span aria-hidden className="text-accent transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">{entry.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
