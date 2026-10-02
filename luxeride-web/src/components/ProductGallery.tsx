"use client";

import { useState } from "react";
import ProductImage from "@/components/ProductImage";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import type { ProductMedia } from "@/lib/media";

/**
 * The PDP gallery.
 *
 * The one place a post-hydration `onError` still belongs: a thumbnail is
 * requested only when the visitor selects it, so a manifest entry that turns out
 * to be wrong cannot be caught at build time. Everywhere else the image is
 * resolved on the server and the placeholder decision is already made.
 *
 * `sizes` is set deliberately. The page this replaces used fixed `h-40 w-52`
 * boxes with `fill` and **no** `sizes`, so the browser assumed `100vw` and
 * downloaded a full-viewport-width file for a 208 px box.
 */
export default function ProductGallery({ media, name }: { media: ProductMedia | null; name: string }) {
  const images = media?.images ?? [];
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<number[]>([]);

  if (images.length === 0) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-panel-2">
        <ProductPlaceholder name={name} />
      </div>
    );
  }

  const showPlaceholder = failed.includes(selected);

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-panel-2">
        {showPlaceholder ? (
          <ProductPlaceholder name={name} />
        ) : (
          <ProductImage
            media={media}
            name={name}
            index={selected}
            sizes="(min-width: 768px) 50vw, 100vw"
            preload
            onError={() => setFailed((prev) => (prev.includes(selected) ? prev : [...prev, selected]))}
          />
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1" role="group" aria-label={`${name} images`}>
          {images.map((entry, i) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              className={`relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg border bg-panel-2 ${
                i === selected ? "border-gold" : "border-line hover:border-gold-dim"
              }`}
            >
              {failed.includes(i) ? (
                <ProductPlaceholder name={name} showLabel={false} />
              ) : (
                <ProductImage media={media} name={name} index={i} sizes="80px" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
