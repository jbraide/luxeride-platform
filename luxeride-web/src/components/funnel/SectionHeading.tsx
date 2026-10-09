import type { SectionHeadingProps } from "@/data/funnel/sections";

/**
 * A funnel page's heading block, and the one place an `h1` is rendered.
 *
 * `level` is the only addition to the shape in `design.md`, and it is there for a
 * document reason rather than a style one: a page needs exactly one `h1`, and a
 * section library that only ever emitted `h2` would leave the page without one. The
 * first section of a page uses `level: 1`; every later heading block defaults to `h2`.
 *
 * A Server Component with no state, so it costs no client JavaScript.
 */
export default function SectionHeading({ level = 2, eyebrow, title, body }: SectionHeadingProps) {
  const headingMargin = eyebrow ? "mt-2" : "";

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-5 py-12">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">{eyebrow}</p>
        ) : null}
        {level === 1 ? (
          <h1 className={`${headingMargin} font-display text-3xl font-semibold leading-tight sm:text-4xl`}>
            {title}
          </h1>
        ) : (
          <h2 className={`${headingMargin} font-display text-2xl font-semibold`}>{title}</h2>
        )}
        {body ? (
          <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">{body}</p>
        ) : null}
      </div>
    </section>
  );
}
