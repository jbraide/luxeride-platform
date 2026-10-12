"use client";

import { useRouter } from "next/navigation";

/**
 * THE OPTION PICKER, AS A DROPDOWN.
 *
 * `BuyBox` renders options as a row of chips, which is the right shape for Floor Mats'
 * two layers — the choice is the point, and two pills show it at a glance. It is the
 * wrong shape for a product with eighteen: Seat Covers carries a base plus seventeen
 * colourways, and eighteen full-width pills pushed the price, the delivery lines and
 * the CTA below them off the first screen. The choice was competing with the thing it
 * was meant to be selling.
 *
 * So the picker switches shape by COUNT, not by product: up to six options stay chips,
 * more than six become this. Nothing about the URL changes — this still selects with
 * `?variation=`, the same query the chips set and the same one the old
 * `/products/double-layer-mats` 307s land on, so a shared or bookmarked link means the
 * same thing either way.
 *
 * IT IS A REAL FORM AND IT WORKS WITHOUT JAVASCRIPT. The `<select>` is inside a
 * `method="get"` form that posts back to this product, and the submit button lives in a
 * `<noscript>` — so a browser with scripting off sees a working "Show" button, and a
 * browser with scripting on sees only the select, which navigates on change. The
 * navigation is a client `router.push`, so the choice does not cost a full page load.
 */
export default function VariationSelect({
  productSlug,
  options,
  selectedSlug,
}: {
  productSlug: string;
  /** `price` is null when every option costs the same, so the list is not noise. */
  options: { slug: string; name: string; price: string | null }[];
  selectedSlug: string | null;
}) {
  const router = useRouter();
  const id = `variation-${productSlug}`;

  return (
    <fieldset className="mt-5">
      <legend className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
        Which option?
      </legend>

      <form method="get" action={`/products/${productSlug}`} className="mt-2">
        <label htmlFor={id} className="sr-only">
          Choose an option
        </label>
        <select
          id={id}
          name="variation"
          defaultValue={selectedSlug ?? ""}
          onChange={(event) => {
            const chosen = event.target.value;
            if (!chosen) return;
            router.push(`/products/${productSlug}?variation=${encodeURIComponent(chosen)}`);
          }}
          className="w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm text-fg focus:border-accent"
        >
          {/* A disabled placeholder, so an unchosen dropdown reads as a question
              rather than silently claiming the first option is selected. */}
          <option value="" disabled>
            Choose an option…
          </option>
          {options.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.price ? `${option.name} — ${option.price}` : option.name}
            </option>
          ))}
        </select>

        {/* Scripting off: the select cannot submit itself, so the button is here. */}
        <noscript>
          <button
            type="submit"
            className="mt-2 w-full rounded-xl border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent"
          >
            Show this option
          </button>
        </noscript>
      </form>

      <p className="mt-2 text-xs text-fg-muted">
        {selectedSlug
          ? "Prices above are for the option you picked. The Fit Finder will confirm it is cut for your car."
          : "Prices vary by option, and by your car. Pick one and the Fit Finder will confirm the fit and the exact price."}
      </p>
    </fieldset>
  );
}
