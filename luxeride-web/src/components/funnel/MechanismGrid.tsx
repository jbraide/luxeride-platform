import type { MechanismGridProps } from "@/data/funnel/sections";

/**
 * How something works, as a grid of short titled items.
 *
 * The `icon` is a single emoji or symbol rendered `aria-hidden`, matching the
 * `TrustStrip` idiom: it is decoration beside a heading that already says what the
 * item is, so a screen reader announcing it would be noise. No imagery prop exists,
 * because a funnel page must not reference a path that resolves to nothing
 * (Requirement 9.4).
 */
export default function MechanismGrid({ items }: MechanismGridProps) {
  return (
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <div key={index}>
              {item.icon ? (
                <span aria-hidden className="text-2xl">
                  {item.icon}
                </span>
              ) : null}
              <h3 className="mt-2 font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
