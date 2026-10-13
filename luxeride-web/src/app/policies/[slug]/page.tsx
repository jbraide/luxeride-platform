import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PolicyPage from "@/components/PolicyPage";
import { POLICY_SLUGS, getPolicy } from "@/data/policies";
import { listDeliveryZones } from "@/lib/delivery";
import { pageMetadata } from "@/lib/seo";

/**
 * The policy routes (`storefront-catalog` §5.6–5.7).
 *
 * Fully determined by compile-time data, so all four slugs prerender and any
 * other slug is a real 404 at the router rather than a render-then-`notFound()`.
 * Each page gets its own title, description and self-referencing canonical via
 * `pageMetadata()`.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) return {};
  return pageMetadata({
    title: policy.title,
    description: policy.summary,
    path: `/policies/${policy.slug}`,
  });
}

export default async function PolicyRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();
  // The delivery policy's zone table is the LIVE `Location` rows, so a fee change in
  // the admin reaches this page. `revalidatePath("/policies/delivery")` in the delivery
  // action is what refreshes it, since this route is prerendered.
  const zones = policy.slug === "delivery" ? await listDeliveryZones() : [];
  return <PolicyPage policy={policy} showZoneTable={policy.slug === "delivery"} zones={zones} />;
}
