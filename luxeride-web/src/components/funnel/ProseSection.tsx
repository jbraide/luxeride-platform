import type { ProseSectionProps } from "@/data/funnel/sections";

/**
 * A run of explanatory paragraphs under a heading — the education page's body.
 *
 * Deliberately narrow measure (`max-w-3xl`): this is the section a visitor reads
 * rather than scans, and a paragraph that runs the width of a desktop is the one
 * that does not get read. Text only; there is no prop that accepts markup
 * (Requirement 2.1).
 */
export default function ProseSection({ heading, paragraphs }: ProseSectionProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="font-display text-2xl font-semibold">{heading}</h2>
        <div className="mt-4 space-y-4">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-base leading-relaxed text-fg/85">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
