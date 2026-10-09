import type { StepProcessProps } from "@/data/funnel/sections";

/**
 * An ordered process — how an order actually goes (Requirement 8).
 *
 * The step NUMBER is rendered from the list index rather than carried in the data,
 * so a content module never holds a bare number that could drift from the list it
 * belongs to, and the marker is `aria-hidden` because an `<ol>` already announces
 * the order.
 */
export default function StepProcess({ steps }: StepProcessProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <ol className="space-y-6">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-accent/40 font-mono text-xs text-accent"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="font-display text-base font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
