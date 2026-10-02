import type { Product } from "@/data/products";

/**
 * The PDP's FAQ.
 *
 * `<details>`/`<summary>` rather than a React accordion: it opens without
 * JavaScript, it is keyboard-operable for free, and it works when a client
 * bundle fails to load — which is the situation where a visitor has the most
 * questions and the least patience.
 *
 * A Server Component rendering only the entries actually present in the data.
 * Three of the seven products carry no FAQ at all, because `storefront-catalog`
 * §7.2 requires an answer to be on record before it is published, and the whole
 * section disappears rather than showing an empty list or a "coming soon" box.
 */
export default function ProductFaq({ product }: { product: Product }) {
  if (product.faq.length === 0) return null;

  return (
    <section aria-labelledby="faq-heading" className="mt-8">
      <h2 id="faq-heading" className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
        Questions
      </h2>
      <div className="mt-3 divide-y divide-white/10 rounded-xl border border-line bg-panel/60">
        {product.faq.map((entry) => (
          <details key={entry.q} className="group px-4 py-3">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium marker:content-none">
              <span>{entry.q}</span>
              <span aria-hidden className="text-gold transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted">{entry.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
