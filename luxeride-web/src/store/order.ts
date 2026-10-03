"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem } from "./cart";
import type { Attribution } from "@/lib/analytics/attribution";

export interface PlacedOrder {
  /** `LR-` + 8 uppercase hex. Renamed from `id`; `cart-checkout` owns minting. */
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
  paymentMethod: "pod" | "prepay";
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  whatsappMessage: string;
  placedAt: string;
}

interface OrderState {
  /** A bounded list of the last 10 orders keyed by `ref`, so a second order
   *  does not erase the first (§7.3) and an unknown ref can miss (§7.4). */
  orders: PlacedOrder[];
  /** Refs for which `Lead` has already fired, so a refresh cannot inflate the
   *  owner's conversion count (§7.7). */
  leadFired: string[];
  setOrder: (order: PlacedOrder) => void;
  getOrder: (ref: string) => PlacedOrder | undefined;
  markLeadFired: (ref: string) => void;
  hasLeadFired: (ref: string) => boolean;
}

const MAX_RETAINED_ORDERS = 10;
const LEGACY_STORAGE_KEY = "luxeride-last-order";

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      leadFired: [],
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
    state.setOrder({ ...old, ref, fitRef: old.fitRef ?? null, attribution: old.attribution ?? null });
  } catch {
    // A corrupt legacy record is not worth failing a page over.
  }
}
