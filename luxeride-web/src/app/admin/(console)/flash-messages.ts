// NO IMPORTS. Deliberately, and it is load-bearing rather than tidiness.
//
// `flash.ts` needs `next/headers` and `next/navigation`, which are SERVER APIs, and
// `AdminNotice` is a Client Component that needs the message table. When both reached
// the same module the build failed with "You're importing a module that depends on
// next/headers into a React Client Component module" — which is the bundler correctly
// refusing to pull a server API into the browser.
//
// So the VOCABULARY lives here, on its own, with nothing above it. The server reads it
// to resolve a flash key before rendering; the client reads it to time the notice out.
// Neither drags the other into its own bundle.
//
// If you add a flash key, add it HERE. The server and the client resolve from the same
// table, which is the only reason the sentence a visitor reads is the sentence the
// operator was shown.

/**
 * EVERY FLASH KEY, AND THE SENTENCE IT PRINTS.
 *
 * One table, in the console shell, because the alternative — each page mapping its own
 * slugs to its own sentences — is how seven screens end up saying seven different
 * things for one action.
 *
 * The keys are past-tense facts about what happened (`confirmed`, not
 * `confirmLayout`), so the copy reads as a report rather than an instruction.
 */
export const FLASH_MESSAGES: Record<string, string> = {
  // The two switches, and the two-word sentences for them.
  live: "Live. The car is offered to customers again.",
  withdrawn: "Withdrawn. It no longer answers fit checks, and its prices and photographs are kept.",

  // Layout / car
  confirmed:
    "Confirmed. The years, the prices and every range were saved together, and the car can now be quoted.",
  unchanged: "Nothing changed, so nothing was written.",
  seatRows: "Saved. The Fit Finder now handles this car without asking about its rows.",
  range: "Range added. It stays unconfirmed until you save the car below.",
  rangeRemoved: "Range removed, and the removal is in the audit log.",
  image: "Photograph added to the range.",
  imageRemoved: "Photograph removed, and the removal is in the audit log.",

  // Exclusions
  exclusion: "Recorded. The refusal will be read before any layout is considered.",
  removed: "Removed, and the removal is in the audit log.",

  // Catalogue — the vehicles list's own reports, one per `setVehiclesActive` /
  // `deleteVehicles` outcome so a bulk action reads as a count rather than a shrug.
  bulkWithdrawn: "Withdrawn. Those year ranges no longer answer fit checks; their prices and photographs are kept.",
  bulkLive: "Live. Those year ranges are offered to customers again.",
  bulkRemoved: "Removed, and every removal is in the audit log.",
  bulkUnchanged: "Nothing changed, so nothing was written.",

  // Catalogue
  category: "Saved. The change is on the shop.",
  categoryDeleted: "Category deleted. It was empty, and the removal is in the audit log.",
  categoryProductsMoved:
    "Moved. The products are in their new category, and this one is empty — delete it below if you still want it gone.",
  categoryProductsDeleted:
    "Category and its products deleted, and every removal is in the audit log.",
  product: "Created, with its first variation. Open it to add more.",
  productDeleted: "Product deleted, and the removal is in the audit log.",
  productArchived:
    "Archived. It is off the shop, and its order history and prices are kept. Put it back whenever you like.",
  productUnarchived: "Back on the shop. Nothing else about it changed.",
  variation: "Variation added.",
  variationDeleted: "Variation deleted, and the removal is in the audit log.",
  variationArchived:
    "Archived. The option is off the product page, and anything sold against it still resolves.",
  variationUnarchived: "Back on the product page.",

  // Bundles
  bundle: "Bundle saved, and its price was worked out from its parts.",
  bundleRemoved: "No longer a bundle. The prices you typed are what it sells at again.",
  bundlePart: "Added, and the bundle has been priced again.",
  bundlePartRemoved: "Taken out, and the bundle has been priced again.",

  // Price
  promotion: "Saved, and the shop has been updated.",
  promotionDeleted: "Promotion deleted, and the removal is in the audit log.",
  coupon: "Saved, and the checkout will accept it.",
  couponDeleted: "Coupon deleted.",

  // Payments / orders (`order-actions.ts`, `/admin/orders`) — one key per status, so
  // the notice reports the status the order moved TO rather than a generic "saved".
  "order-pending": "Saved. The order is back to pending.",
  "order-confirmed": "Saved. The order is confirmed — you have accepted it.",
  "order-fulfilled": "Saved. The order is marked fulfilled.",
  "order-cancelled": "Saved. The order is cancelled, and the row is kept so its reference still resolves.",

  // Storefront appearance
  heroLayout: "Saved. The homepage hero is now laid out that way for everyone.",

  // Delivery zones (`/admin/delivery`)
  deliveryZoneAdded: "Zone added. It is on the checkout, and its fee is what a customer in it will be charged.",
  deliveryZoneSaved: "Saved. The new fee and window are live at checkout and on the delivery policy.",
  deliveryZoneDeleted: "Zone deleted, and the removal is in the audit log.",
  deliveryBulkSaved: "Saved. That fee is now live on every zone you ticked.",
};

/** The sentence for a flash key, or null when the key is not one we know. */
export function flashMessage(key: string | null): string | null {
  if (!key) return null;
  return FLASH_MESSAGES[key] ?? null;
}
