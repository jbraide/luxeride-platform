import type { RiskReversalProps } from "@/data/funnel/sections";

/**
 * The reasons it is safe to proceed — a short list, nothing more.
 *
 * A plain list of strings rather than objects, because each line is one sentence and
 * a title/body pair would invite a heading that says nothing. The lines are PROCESS
 * facts (we confirm the fit before we cut), not the guarantee text: the guarantee and
 * the delivery figures are owned by `src/lib/copy.ts` and rendered from there by
 * `TrustStrip`, so this section never restates them and cannot drift from them
 * (Requirement 2.2).
 */
export default function RiskReversal({ items }: RiskReversalProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed text-fg/85">
              <span aria-hidden className="mt-0.5 text-accent">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
