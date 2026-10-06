import type { Metadata } from "next";
import FitFinder from "@/components/FitFinder";
import { listProducts } from "@/lib/catalogue";
import { resolveCampaign } from "@/data/landing";
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
  searchParams: Promise<{ product?: string; variation?: string | string[] }>;
}) {
  const { product, variation } = await searchParams;
  // A Client Component cannot read the media manifest, so the server resolves it
  // for the whole catalogue and passes plain data down.
  // The catalogue comes from the database, so a product created in
  // `/admin/products` can be offered on this step without a redeploy. It is already
  // async; this adds one read to a page that was always server-rendered.
  const products = await listProducts();
  const mediaBySlug = resolveAllMedia(products.map((p) => p.slug));
  // Resolve the campaign on the server too, so the alias locks the RIGHT product.
  // Passing the raw value straight through meant `?product=mats` locked nothing,
  // because `mats` is an alias, not a product slug (`ad-landing-and-tracking` §3.5).
  const resolvedLanding = resolveCampaign(
    product,
    // The option the link named. This is the PDP's own "Select My Car" CTA arriving
    // with the layer the customer just picked — dropping it here is what would send
    // them back through the layer question having already answered it.
    Array.isArray(variation) ? variation[0] : (variation ?? null),
  );
  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <FitFinder
        products={products}
        lockedProductSlug={resolvedLanding?.productSlug ?? product}
        lockedVariationSlug={resolvedLanding?.variationSlug}
        mediaBySlug={mediaBySlug}
        resolvedLanding={resolvedLanding}
      />
    </div>
  );
}
