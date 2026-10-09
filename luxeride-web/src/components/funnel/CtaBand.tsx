import { LinkButton } from "@/components/Button";
import type { CtaBandProps } from "@/data/funnel/sections";

/**
 * The action band at the foot of a funnel page.
 *
 * `LinkButton` (the existing component) rather than a new button, so the funnel's
 * primary action is the same object as the rest of the site's `sm:w-auto` inline
 * variant. Both `href`s are internal routes that exist; a content module's targets
 * are asserted against the route allow-list in `scripts/funnel-content.test.mjs`.
 */
export default function CtaBand({ primary, secondary }: CtaBandProps) {
  return (
    <section className="bg-accent/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center">
        <LinkButton href={primary.href} className="sm:w-auto sm:px-8">
          {primary.label}
        </LinkButton>
        {secondary ? (
          <LinkButton href={secondary.href} variant="outline" className="sm:w-auto sm:px-8">
            {secondary.label}
          </LinkButton>
        ) : null}
      </div>
    </section>
  );
}
