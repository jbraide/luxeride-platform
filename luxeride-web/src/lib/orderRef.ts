/**
 * The order reference (`ad-landing-and-tracking` §6.1–6.3).
 *
 * Format: `LR-` + 8 uppercase hex, derived from `crypto.randomUUID()`. NOT
 * derived from the wall clock and NOT sequential, so consecutive orders cannot
 * be enumerated by incrementing a counter. The order's date is carried
 * separately by `PlacedOrder.placedAt`.
 */

function mint(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : // Weaker fallback, matching `src/store/cart.ts`, kept so ids are minted
        // one way across the app when `randomUUID` is unavailable.
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  const hex = uuid.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return `LR-${(hex + "00000000").slice(0, 8)}`;
}

/**
 * Mint against the retained order history, re-rolling up to three times on a
 * collision. A fourth collision appends a counter rather than reusing a ref.
 */
export function createOrderRef(existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = mint();
    if (!taken.has(candidate)) return candidate;
  }

  let counter = 1;
  let candidate = `${mint()}-${counter}`;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${mint()}-${counter}`;
  }
  return candidate;
}
