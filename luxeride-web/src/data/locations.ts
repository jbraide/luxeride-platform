export interface LocationZone {
  name: string;
  eta: string;
  fee: number;
}

/**
 * THE SEED, AND ONLY THE SEED.
 *
 * The running app reads the `Location` TABLE (`src/lib/delivery.ts`), because the owner
 * edits fees, windows and whole zones in `/admin/delivery` and a compile-time constant
 * cannot be edited. This array is what `prisma/seed.mts` writes into a FRESH database;
 * changing it afterwards changes nothing on the live site. Do not read it from the app.
 */
export const LOCATIONS: LocationZone[] = [
  { name: "Lagos Mainland & Island", eta: "24–48 hours", fee: 9000 },
  { name: "Abuja Central & Outskirts", eta: "3–5 days", fee: 6000 },
  { name: "PH, Owerri, Calabar, Warri & Benin", eta: "3–5 days", fee: 12000 },
  { name: "Other State", eta: "5–7 days", fee: 12000 },
];

export const WHATSAPP_NUMBER = "2347049621694";
