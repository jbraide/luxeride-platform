"use client";

import { useCallback, useEffect, useState } from "react";
import ProductImage from "@/components/ProductImage";
import type { ProductMedia } from "@/lib/media";

/**
 * The product photograph, full screen.
 *
 * WHY IT EXISTS. A laser-cut mat is sold on its edges and its texture, and a 4:3 card
 * cannot show either at a size a phone can judge. The gallery stays the browsing surface;
 * this is the "look closely" one.
 *
 * NO LIBRARY. It is a fixed overlay, an `<Image>` at `object-contain`, two arrows and
 * Escape — the whole of what a lightbox does, with no dependency to keep.
 *
 * ACCESSIBILITY: `role="dialog"` + `aria-modal`, Escape closes, the backdrop closes, and
 * the arrow keys move between images. Focus returns to whatever opened it because the
 * opener is the element that had focus and nothing here steals it on unmount. Body scroll
 * is locked while it is open, which is the one thing a `position: fixed` overlay does not
 * give you for free on iOS.
 */
export default function Lightbox({
  media,
  name,
  startIndex,
  onClose,
}: {
  media: ProductMedia;
  name: string;
  startIndex: number;
  onClose: () => void;
}) {
  const images = media.images ?? [];
  const [index, setIndex] = useState(startIndex);
  const last = images.length - 1;

  const step = useCallback(
    (delta: number) => setIndex((current) => Math.min(last, Math.max(0, current + delta))),
    [last],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, step]);

  if (images.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — image ${index + 1} of ${images.length}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/40 px-3 py-2 text-sm text-white hover:border-white"
      >
        Close
      </button>

      <div
        className="relative h-[70vh] w-full max-w-5xl"
        onClick={(event) => event.stopPropagation()}
      >
        <ProductImage
          media={media}
          name={name}
          index={index}
          sizes="100vw"
          className="object-contain"
        />
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            disabled={index === 0}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-black/40 px-3 py-2 text-white hover:border-white disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            disabled={index === last}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-black/40 px-3 py-2 text-white hover:border-white disabled:opacity-30"
          >
            ›
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-white/80">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}
