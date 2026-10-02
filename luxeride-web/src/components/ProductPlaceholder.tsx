/**
 * The branded stand-in for a product photograph that does not exist yet.
 *
 * It occupies exactly the box the real image will occupy — the parent is always
 * a `relative aspect-[4/3]` (card, PDP, cart) — so swapping in real photography
 * later moves nothing on the page. No `"use client"`: it is pure markup and is
 * used from both Server and Client Component trees.
 *
 * The visual idiom (gradient `#1c1916` -> `#0a0a0a`, gold reticle corners) is
 * taken from `public/products/single-layer.svg`, which it replaces on screen.
 */
export default function ProductPlaceholder({
  name,
  showLabel = true,
}: {
  name: string;
  /** `false` in the cart, which already prints the product name next to it. */
  showLabel?: boolean;
}) {
  return (
    // A <span>, not a <div>. The PDP gallery renders this inside a <button>,
    // whose content model is phrasing content only — a <div> there is invalid
    // HTML that browsers tolerate and validators do not. `absolute` blockifies
    // the span, so the layout is identical either way.
    <span
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-panel-2 to-ink"
      {...(showLabel
        ? { role: "img", "aria-label": `${name} — photograph not yet available` }
        : { "aria-hidden": true })}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-gold/70" />
        <span className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-gold/70" />
        <span className="absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-gold/70" />
        <span className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-gold/70" />
      </span>

      {showLabel && (
        <span aria-hidden className="px-6 text-center">
          <span className="font-display block text-sm font-medium leading-tight text-white/85">
            {name}
          </span>
          <span className="font-mono mt-1 block text-[10px] uppercase tracking-widest text-gold-dim">
            Photo pending
          </span>
        </span>
      )}
    </span>
  );
}
