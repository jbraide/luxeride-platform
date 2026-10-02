"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem } from "./cart";

export interface PlacedOrder {
  id: string;
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
  lastOrder: PlacedOrder | null;
  setLastOrder: (order: PlacedOrder) => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      lastOrder: null,
      setLastOrder: (order) => set({ lastOrder: order }),
    }),
    { name: "luxeride-last-order" }
  )
);
