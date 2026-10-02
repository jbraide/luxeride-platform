import FitFinder from "@/components/FitFinder";
import { PRODUCTS } from "@/data/products";
import { resolveAllMedia } from "@/lib/media-manifest";

export default async function FitFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  // A Client Component cannot read the media manifest, so the server resolves it
  // for the whole catalogue and passes plain data down.
  const mediaBySlug = resolveAllMedia(PRODUCTS.map((p) => p.slug));
  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <FitFinder lockedProductSlug={product} mediaBySlug={mediaBySlug} />
    </div>
  );
}
