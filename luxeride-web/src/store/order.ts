"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem } from "./cart";
import type { Attribution } from "@/lib/analytics/attribution";

export interface PlacedOrder {
  /**
   * `LR-` + 10 Crockford base32, **minted by the server** at
   * `POST /api/orders` since M6.7. The browser never mints one on the happy
   * path; a reference no server has seen is not a record of anything.
   */
  ref: string;
  /**
   * The fitment layout code, a SEPARATE field from the reference — never
   * concatenated (§6.6). `null` until `fitment-engine` lands.
   */
  fitRef: string | null;
  /** Copied at submit, so the order carries its own campaign (§5.6). */
  attribution: Attribution | null;
  name: string;
  phone: string;
  address: string;
  location: string;
  /**
   * The arrival estimate as snapshotted by the server at write time
   * (`Order.locationEta`), not a fresh lookup. A later edit to the zone must not
   * rewrite what the customer was told.
   */
  locationEta: string | null;
  paymentMethod: "pod" | "prepay";
  /**
   * `CartItem[]` still, because the shape is what the screens already render —
   * but every `unitPrice` in here is the SERVER's recomputed figure, taken from
   * the `/api/orders` response. Before M6.7 this froze the client's own
   * unverified prices into what looked like an order record (`cart-checkout` §1.6).
   */
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  whatsappMessage: string;
  placedAt: string;
  /**
   * `false` when the database write failed and this record exists only in the
   * WhatsApp thread. The confirmation screen must not render a success tick for
   * one of these (`cart-checkout` requirement 1.4).
   */
  persisted: boolean;
}

/**
 * The half-typed checkout, persisted so a refresh, a crash or a back-swipe does
 * not discard it (`cart-checkout` requirement 9.1).
 *
 * It lives in this store rather than in component state because the whole point
 * is to outlive the component. `consent` is included deliberately and is NOT
 * restored: ticking a privacy box is a decision, and silently re-ticking one on
 * the customer's behalf is not consent this session asked for.
 */
export interface CheckoutDraft {
  name: string;
  phone: string;
  address: string;
  location: string;
  paymentMethod: "pod" | "prepay";
  updatedAt: string;
}

export const EMPTY_DRAFT: CheckoutDraft = {
  name: "",
  phone: "",
  address: "",
  location: "",
  paymentMethod: "pod",
  updatedAt: "",
};

interface OrderState {
  /** A bounded list of the last 10 orders keyed by `ref`, so a second order
   *  does not erase the first (§7.3) and an unknown ref can miss (§7.4). */
  orders: PlacedOrder[];
  /** Refs for which `Lead` has already fired, so a refresh cannot inflate the
   *  owner's conversion count (§7.7). */
  leadFired: string[];
  /** The in-progress checkout. Cleared only on a successful handoff (§9.2). */
  draft: CheckoutDraft;
  setOrder: (order: PlacedOrder) => void;
  getOrder: (ref: string) => PlacedOrder | undefined;
  markLeadFired: (ref: string) => void;
  hasLeadFired: (ref: string) => boolean;
  setDraft: (draft: CheckoutDraft) => void;
  clearDraft: () => void;
}

const MAX_RETAINED_ORDERS = 10;
const LEGACY_STORAGE_KEY = "luxeride-last-order";

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      leadFired: [],
      draft: EMPTY_DRAFT,
      setOrder: (order) =>
        set((state) => ({
          orders: [order, ...state.orders.filter((o) => o.ref !== order.ref)].slice(
            0,
            MAX_RETAINED_ORDERS,
          ),
        })),
      getOrder: (ref) => get().orders.find((o) => o.ref === ref),
      markLeadFired: (ref) =>
        set((state) =>
          state.leadFired.includes(ref) ? state : { leadFired: [...state.leadFired, ref] },
        ),
      hasLeadFired: (ref) => get().leadFired.includes(ref),
      setDraft: (draft) => set({ draft }),
      clearDraft: () => set({ draft: EMPTY_DRAFT }),
    }),
    { name: "luxeride-orders" },
  ),
);

/**
 * One-time migration from the single-order store (§9.9). Call it from a mount
 * effect — never at module scope, because `localStorage` does not exist during
 * server rendering.
 *
 * The old store used the key `luxeride-last-order`, so zustand's own `migrate`
 * can never see it; the move has to be explicit. It only runs when the new store
 * is still empty, so it cannot clobber a newer order.
 */
export function migrateLegacyOrder(): void {
  if (typeof window === "undefined") return;
  const state = useOrderStore.getState();
  if (state.orders.length > 0) return;

  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      state?: { lastOrder?: PlacedOrder & { id?: string } };
    };
    const old = parsed.state?.lastOrder;
    if (!old) return;
    const ref = old.ref ?? old.id ?? "LR-00000000";
    state.setOrder({
      ...old,
      ref,
      fitRef: old.fitRef ?? null,
      attribution: old.attribution ?? null,
      // Both are new columns a record written before M6.7 never had. A legacy
      // record is by definition a client-computed one, so it is marked
      // `persisted: false`: the confirmation screen must not show a tick for an
      // order no server ever priced.
      locationEta: old.locationEta ?? null,
      persisted: old.persisted ?? false,
    });
  } catch {
    // A corrupt legacy record is not worth failing a page over.
  }
}
