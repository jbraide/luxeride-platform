import type { CostCardsProps } from "@/data/funnel/sections";

/**
 * What something costs you, as a grid of labelled cards.
 *
 * `value` is a STRING and not a number on purpose. A cost card is where a naira
 * figure would naturally go, and Requirement 3.4 says a figure that cannot be
 * attributed to a stated source must be omitted — with the value as free text, a
 * content module can say "Not published" where it cannot say a number, and there is
 * no numeric field for a price to be typed into (Requirement 4.1).
 *
 * `footnote` is the place for the attribution a figure would need, and the tests in
 * `scripts/funnel-content.test.mjs` assert that no card value carries a naira figure
 * or a digit sequence a reader would read as a price.
 */
export default function CostCards({ items, footnote }: CostCardsProps) {
  return (
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-surface/60 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">{item.label}</p>
              <p className="mt-2 font-display text-xl font-semibold">{item.value}</p>
              {item.note ? (
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.note}</p>
              ) : null}
            </div>
          ))}
        </div>
        {footnote ? <p className="mt-4 max-w-prose text-xs text-fg-muted">{footnote}</p> : null}
      </div>
    </section>
  );
}
