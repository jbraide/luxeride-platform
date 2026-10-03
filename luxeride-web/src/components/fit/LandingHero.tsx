import Link from "next/link";
import type { ResolvedLanding } from "@/data/landing";

/**
 * The `/fit-finder` landing hero (`fit-finder` §8.3).
 *
 * Rendered by the Server Component page ABOVE the funnel, so a stranger who
 * clicked an ad sees the same headline the ad carried before they are asked for
 * anything. It is the `/` hero's twin, deliberately: the same `{em}` splitting,
 * the same offer badge, the same never-absent copy.
 *
 * §8.6: the resolved campaign key, the product slug, the headline and the sub
 * are exported as `data-*` attributes so the tracking layer can report which
 * variant was served. They are plain attributes on a server-rendered element,
 * so they are present in the HTML a crawler and the pixel both see.
 *
 * When nothing resolves it renders `null` — the funnel below already carries its
 * own default heading, and stacking two headings would push the funnel down the
 * page for organic traffic (`fit-finder` §8.5, §1.2).
 */

function renderHeadline(headline: string) {
  return headline.split("{em}").map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-gold">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

export default function LandingHero({ landing }: { landing: ResolvedLanding | null }) {
  if (!landing) return null;

  return (
    <section
      className="mb-8 text-center"
      data-campaign={landing.campaignSlug ?? ""}
      data-landing-product={landing.productSlug}
      data-landing-match={landing.match}
      data-landing-headline={landing.headline}
      data-landing-sub={landing.sub}
    >
      <h1 className="font-display text-3xl font-semibold leading-tight">
        {renderHeadline(landing.headline)}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-white/70">{landing.sub}</p>

      {landing.offer && (
        <p className="mx-auto mt-3 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wide text-gold">
          {landing.offer}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {["LASER-MEASURED", "100% WATERPROOF", "PAY ON DELIVERY"].map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-gold"
          >
            {badge}
          </span>
        ))}
      </div>

      <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-gold-dim">
        <Link href="/shop" className="hover:text-gold">
          Browse everything instead →
        </Link>
      </p>
    </section>
  );
}