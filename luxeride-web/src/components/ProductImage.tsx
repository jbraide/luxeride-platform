import Image from "next/image";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import { mediaUrl, type ProductMedia } from "@/lib/media";

/**
 * A product photograph, or the branded placeholder when there is none.
 *
 * Deliberately **not** a `"use client"` component, and deliberately not
 * filesystem-aware either: it takes already-resolved `media` as a prop, so the
 * same component works in a Server Component tree (a card on `/shop`) and in a
 * Client Component tree (the PDP gallery, which needs selection state and an
 * `onError` swap). The server resolves through `resolveMedia()`; the client
 * receives the plain data.
 *
 * The previous `SafeImage` was a `"use client"` component that turned every
 * card image into a client boundary inside an otherwise server-rendered page —
 * for an `onError` handler that only ever fired because the file was missing.
 * Missing files are now a build-time fact: `scripts/media.mjs --check` fails the
 * build if any declared path has no file behind it.
 */
export default function ProductImage({
  media,
  name,
  index = 0,
  sizes,
  className = "object-cover",
  preload = false,
  onError,
}: {
  media: ProductMedia | null;
  /** Used for `alt` when the manifest entry carries none, and for the placeholder. */
  name: string;
  index?: number;
  /** Required: `fill` without `sizes` makes the browser assume `100vw`. */
  sizes: string;
  className?: string;
  /** Next 16 replaced `priority` with `preload`; never set both. */
  preload?: boolean;
  onError?: () => void;
}) {
  const entry = media?.images[index];
  if (!entry) return <ProductPlaceholder name={name} />;

  return (
    <Image
      src={mediaUrl(entry)}
      alt={entry.alt || name}
      fill
      sizes={sizes}
      className={className}
      preload={preload}
      onError={onError}
      {...(entry.blurDataURL ? { placeholder: "blur", blurDataURL: entry.blurDataURL } : {})}
    />
  );
}
