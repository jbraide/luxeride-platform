import type { Metadata } from "next";
import FitFinder from "@/components/FitFinder";
import { PRODUCTS } from "@/data/products";
import { resolveAllMedia } from "@/lib/media-manifest";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Find Your Perfect Fit",
  description:
    "Tell us your car and we will check which custom-fit accessories we actually make for it. No guesswork, and we tell you plainly when a fit is not covered.",
  path: "/fit-finder",
});

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
