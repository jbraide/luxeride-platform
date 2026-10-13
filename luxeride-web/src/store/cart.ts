"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { lineKey } from "../lib/order-pricing.ts";
import { MAX_LINE_QTY } from "../lib/pricing.ts";

/**
 * The cart store — `cart-checkout` §7 and task 8.
 *
 * ONE ROW PER PRODUCT PER CAR, NOT PER TAP
 *
 * The defect this file used to have: `addItem` always pushed, so tapping "Add
 * to Cart" twice produced two identical rows and a WhatsApp order that listed
 * the same item twice. Requirement 7.1 says the second add merges, so the merge
 * key is `lineKey()` from `src/lib/order-pricing.ts` — the SAME function the
 * server uses to key a priced line, deliberately, so the cart and the priced
 * order cannot describe the cart differently.
 *
 * The key is product slug + brand + model + year + rows, and never the quantity,
 * the id or the price. Two things follow, both wanted: a 2015 Camry and a 2019
 * Camry are two lines for the same product (different fit, different price —
 * merging them would quote one car at the other's price), while a 2-row and a
 * 3-row set are two lines for the same car (different mats).
 *
 * WHY THIS IS WRITTEN FOR `node --test`
 *
 * Everything below is either pure or reachable through the store's own actions,
 * and the only imports are `zustand` plus two sibling modules that resolve
 * without the `@/*` alias. `scripts/cart.test.mjs` therefore exercises this file
 * directly under `node --test`, in milliseconds, with no browser and no DOM —
 * Node has no `localStorage`, so `persist` finds no storage and simply does
 * nothing, which is why the actions are testable but the persistence path is
 * not (that part is argued in `CART_STORE_VERSION` below instead).
 */

export interface CartItem {
  id: string;
  productSlug: string;
  /**
   * WHICH OPTION of the product, when the product has more than one.
   *
   * Added 2026-10-05, when single layer and double layer stopped being two products
   * and became two options of one. It is part of the line's IDENTITY rather than
   * decoration, and `lineKey()` already includes it: two layers of the same mats for
   * the same car are two different things at two different prices, so they are two
   * lines. Without this field on the cart, adding a double-layer set after a
   * single-layer one would merge into the first and halve the order.
   *
   * `null`/absent means "the product, option unspecified", which is what it meant
   * before `ProductVariation` existed and is still right for every product with one
   * option. It is not the same as the product's floor price — the server prices a
   * named option from that option's figures.
   */
  variationSlug?: string | null;
  productName: string;
  brand: string;
  model: string;
  year: string;
  rows: "2" | "3" | null;
  unitPrice: number;
  qty: number;
  image?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id" | "qty">, qty?: number) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  subtotal: () => number;
  count: () => number;
}

/**
 * The persisted-shape version.
 *
 * Set even though `CartItem` did not change, and deliberately paired with a
 * `migrate` rather than with a bare bump: a future version change that ships
 * without a `migrate` would make zustand throw the stored cart away entirely,
 * and the whole point of this file is that a visitor does not lose a cart.
 */
export const CART_STORE_VERSION = 1;

/**
 * Clamp to the band the server will accept, `1..MAX_LINE_QTY`.
 *
 * The ceiling is imported, never repeated: `validateQty()` in
 * `src/lib/order-validation.ts` REJECTS a quantity outside 1-99 rather than
 * clamping it (`commerce-backend` §5.3, "a silently corrected quantity is how a
 * wrong order becomes a real order"), so a cart that reached 100 would fail
 * checkout whole with nothing the customer could fix from the cart screen.
 *
 * The floor of 1 is not a policy number — it is what "this line exists" means.
 * `setLineQty` removes a line at or below zero (`cart-checkout` §7.2) rather
 * than storing one.
 *
 * `Math.round` because no control in this UI can produce a fraction, and the
 * server rejects one outright; a fractional quantity carried from a hand-edited
 * cart would 422 at checkout with nothing the customer could see or fix.
 */
export function clampQty(qty: number): number {
  return Math.min(MAX_LINE_QTY, Math.max(1, Math.round(qty)));
}

/** `null` for anything that is not a finite number, which is what gets dropped. */
function normaliseQty(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? clampQty(raw) : null;
}

/**
 * An option slug, or `null` for a line that names none.
 *
 * Kept OPTIONAL rather than required in the persisted shape: a cart written before
 * 2026-10-05 carries no such key on any line, and rehydrating one must not drop every
 * line in it. Absent and empty both mean "no option named", which is exactly what an
 * old line meant.
 */
function optionSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** A non-empty trimmed string, or `null` for the fields that must be present. */
function text(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Merge an added line into the cart, or push it.
 *
 * On a merge the EXISTING line keeps its `id` — so a React key, and any control
 * holding that id, survives the merge — while the incoming line's display
 * fields win. The unit price is the one that matters: it is re-read from
 * `productBase()` on every add, so merging takes the fresher figure and a cart
 * someone edited downwards in devtools is corrected by the next legitimate add
 * rather than carried to checkout. The server recomputes it regardless
 * (`cart-checkout` requirement 3.2); this only keeps the cart screen honest.
 */
export function mergeLine(items: readonly CartItem[], incoming: CartItem): CartItem[] {
  const key = lineKey(incoming);
  const index = items.findIndex((item) => lineKey(item) === key);
  if (index === -1) return [...items, incoming];

  const existing = items[index];
  const merged: CartItem = {
    ...existing,
    productName: incoming.productName,
    unitPrice: incoming.unitPrice,
    image: incoming.image ?? existing.image,
    qty: clampQty(existing.qty + incoming.qty),
  };

  const next = items.slice();
  next[index] = merged;
  return next;
}

/**
 * Set one line's quantity, or remove the line (`cart-checkout` §7.2).
 *
 * At or below zero the line goes, because "quantity zero" is not a cart state a
 * customer can reach except by pressing "–" once too often, and that press is
 * meant to take the line away. Every other line is left exactly as it was
 * (§7.5).
 */
export function setLineQty(
  items: readonly CartItem[],
  id: string,
  qty: number
): CartItem[] {
  if (!(qty >= 1)) return items.filter((item) => item.id !== id);
  const clamped = clampQty(qty);
  return items.map((item) => (item.id === id ? { ...item, qty: clamped } : item));
}

/** Drop one line, touching nothing else (§7.5). */
export function removeLine(items: readonly CartItem[], id: string): CartItem[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Rebuild the cart from whatever storage held — `cart-checkout` §7.4.
 *
 * Two jobs, both on data this file cannot vouch for: drop entries that are
 * structurally invalid, and collapse the duplicate lines that the old
 * always-push `addItem` wrote. The second is why this runs on every
 * rehydration rather than only inside `addItem` — a cart that already contains
 * two identical rows stays broken forever if the repair only happens on the next
 * add, and this is the only code that sees an old cart at all.
 *
 * WHAT IS DROPPED, and why it is that list and not a wider one:
 *
 * - a missing slug, or a PARTIALLY-named car — the line cannot be quoted, and
 *   `validateOrderSubmission` would reject the WHOLE order for it (§5.3), so
 *   keeping it costs the customer every other line in the cart. An ENTIRELY absent car
 *   is NOT dropped: that is a shop-only line, and it is valid.
 * - a non-finite or negative `unitPrice` — a price is not a thing you can fix by
 *   guessing at it.
 * - a non-numeric `qty`.
 * - an unknown `rows`. `undefined` counts as unknown, matching `validateRows`,
 *   which rejects it on purpose so a missing key cannot be read as "not a row
 *   question" and quietly drop a surcharge the customer was quoted.
 *
 * What is NOT dropped: a quantity out of band or fractional, and a missing `id`.
 * Both are repaired instead — clamped, and given the line key as its id — because
 * discarding a product-for-a-car the customer deliberately added over a bad
 * number in one field loses a real line and keeps a broken cart.
 */
export function sanitiseCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  const valid: CartItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const candidate = entry as Partial<CartItem>;

    const productSlug = text(candidate.productSlug);
    const brand = text(candidate.brand);
    const model = text(candidate.model);
    const year = text(candidate.year);
    const qty = normaliseQty(candidate.qty);
    const unitPrice =
      typeof candidate.unitPrice === "number" &&
      Number.isFinite(candidate.unitPrice) &&
      candidate.unitPrice >= 0
        ? candidate.unitPrice
        : null;

    // A LINE WITH NO CAR IS VALID: a shop-only product is bought without a make or model.
    // A PARTIAL car is not — that is a car-specific line that lost a field, the server
    // would refuse the whole order for it, and it is dropped here like the other unusable
    // lines. `null` is "absent"; the stored value is the empty string, matching
    // `CartItem`'s `string` car fields.
    const hasCar = brand !== null && model !== null && year !== null;
    const noCar = brand === null && model === null && year === null;

    if (
      productSlug === null ||
      (!hasCar && !noCar) ||
      qty === null ||
      unitPrice === null
    ) {
      continue;
    }
    if (!(candidate.rows === null || candidate.rows === "2" || candidate.rows === "3")) continue;
    const option = optionSlug(candidate.variationSlug);
    const carBrand = brand ?? "";
    const carModel = model ?? "";
    const carYear = year ?? "";

    const line: CartItem = {
      // The line key doubles as the fallback id: it is already unique per line
      // and it is stable across re-renders, which a random id would not be.
      id:
        text(candidate.id) ??
        lineKey({
          productSlug,
          // The key MUST be rebuilt from the option the line actually carries, or a
          // cart written by an older build gets ids keyed without it and a line added
          // afterwards finds no match for itself.
          variationSlug: option,
          brand: carBrand,
          model: carModel,
          year: carYear,
          rows: candidate.rows,
          qty,
        }),
      productSlug,
      variationSlug: option,
      productName: text(candidate.productName) ?? productSlug,
      brand: carBrand,
      model: carModel,
      year: carYear,
      rows: candidate.rows,
      unitPrice,
      qty,
    };
    if (typeof candidate.image === "string") line.image = candidate.image;

    // The same merge `addItem` performs, for the same reason: an old cart holds
    // the duplicates this bug wrote, and rehydrating must not put them back.
    const merged = mergeLine(valid, line);
    valid.length = 0;
    valid.push(...merged);
  }

  return valid;
}

/** Persisted slices carry `items` and nothing else; the actions are dropped by JSON. */
function persistedItems(persistedState: unknown): unknown {
  if (typeof persistedState !== "object" || persistedState === null) return [];
  return (persistedState as { items?: unknown }).items;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, qty = 1) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${item.productSlug}-${Date.now()}`;
        set((state) => ({ items: mergeLine(state.items, { ...item, id, qty: clampQty(qty) }) }));
      },
      removeItem: (id) => set((state) => ({ items: removeLine(state.items, id) })),
      setQty: (id, qty) => set((state) => ({ items: setLineQty(state.items, id, qty) })),
      clear: () => set({ items: [] }),
      subtotal: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
      count: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    {
      name: "luxeride-cart",
      version: CART_STORE_VERSION,
      /**
       * `merge`, not just `migrate`, is what repairs a cart written by the old
       * `addItem`. Read in `node_modules/zustand/esm/middleware.mjs`: `migrate`
       * runs only when the STORED version is a number and differs from ours —
       * and this store shipped with no `version` at all, so every cart already
       * in a browser carries none and would sail straight past a version check.
       * `merge` runs on every rehydration, so `sanitiseCartItems` sees legacy
       * carts, migrated carts and new ones through one path.
       *
       * `migrate` is still supplied, pointing at the same repair: it is the hook
       * a future `CART_STORE_VERSION` bump extends, and its presence is what
       * keeps that bump from silently discarding carts.
       */
      merge: (persistedState, currentState) => ({
        ...currentState,
        items: sanitiseCartItems(persistedItems(persistedState)),
      }),
      migrate: (persistedState) => ({ items: sanitiseCartItems(persistedItems(persistedState)) }),
    }
  )
);