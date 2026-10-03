import { LinkButton } from "@/components/Button";
import { DEFAULT_HEADLINE, DEFAULT_SUB, type ResolvedLanding } from "@/data/landing";

/**
 * The home hero (`ad-landing-and-tracking` §3.2).
 *
 * A Server Component. It renders exactly the copy that ships today when nothing
 * resolves — no layout shift and no empty campaign slot (§1.9) — and a resolved
 * campaign's headline, sub and offer badge when one does, with the primary CTA
 * pre-locking the product so the funnel's product step is skipped (§1.2).
 *
 * `{em}…{em}` is split here and rendered as a `<span className="text-gold">`.
 * The prototype wrote its headline with `innerHTML` (line 729); this never does,
 * so a campaign string can never inject markup (§3.4).
 */

function renderHeadline(headline: string) {
  // Split on the marker; odd-indexed parts are the highlighted phrase.
  return headline.split("{em}").map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-gold">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default function HomeHero({ landing }: { landing: ResolvedLanding | null }) {
  const headline = landing?.headline ?? DEFAULT_HEADLINE;
  const sub = landing?.sub ?? DEFAULT_SUB;
  // A resolved variant (campaign or bare product slug) pre-locks the product.
  const ctaHref = landing ? `/fit-finder?product=${encodeURIComponent(landing.raw)}` : "/fit-finder";

  return (
    <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 text-center">
      <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
        {renderHeadline(headline)}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-white/70">{sub}</p>

      {landing?.offer && (
        <p className="mx-auto mt-4 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wide text-gold">
          {landing.offer}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <LinkButton href={ctaHref} className="sm:w-auto sm:px-8">
          Find My Perfect Fit
        </LinkButton>
        <LinkButton href="/shop" variant="outline" className="sm:w-auto sm:px-8">
          Browse All Products
        </LinkButton>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {["LASER-MEASURED", "100% WATERPROOF", "PAY ON DELIVERY"].map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-gold"
          >
            {badge}
          </span>
        ))}
      </div>
    </section>
  );
}
