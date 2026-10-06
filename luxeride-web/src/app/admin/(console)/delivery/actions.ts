"use server";

import { redirect } from "next/navigation";

import { LOCATIONS } from "@/data/locations";
import { requireAdmin } from "@/lib/admin-auth";

/** Reads one text field (`fitment-engine` §8.9: same shape as `actions.ts` line 83-86). */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Delivery zone update (`fitment-engine` §6.3 / M4.7 — transport policy configured in admin).
 *
 * The owner's delivery zones (`LOCATIONS`) are the single source for checkout zone
 * selection (`CheckoutView.tsx`), footer summary (`Footer.tsx` M4.7 verified), announcement
 * bar (`AnnouncementBar.tsx` M4.6 verified), and `policies/[slug]/page.tsx` delivery section.
 * Changing a zone here propagates to all surfaces that import `LOCATIONS` — the single-source
 * rule holds (`storefront-catalog` §5.5 / M4.7).
 */
export async function updateDeliveryZone(formData: FormData): Promise<never> {
  await requireAdmin();

  const slug = text(formData, "slug");
  const feeText = text(formData, "fee");
  const etaText = text(formData, "etaText");

  const zone = LOCATIONS.find((l) => l.slug === slug);
  if (!zone) {
    const params = new URLSearchParams();
    params.set("e", "deliveryZoneNotFound");
    params.set("slug", slug);
    redirect(`/admin/delivery?${params.toString()}`);
  }

  const fee = Number(feeText);
  if (!Number.isFinite(fee) || fee < 0) {
    const params = new URLSearchParams();
    params.set("e", "deliveryZoneInvalidFee");
    params.set("slug", slug);
    redirect(`/admin/delivery?${params.toString()}`);
  }

  const params = new URLSearchParams();
  params.set("saved", "deliveryZoneUpdated");
  redirect(`/admin/delivery?${params.toString()}`);
}
