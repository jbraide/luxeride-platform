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
 *
 * ── WHY 37 STATES AND NOT FOUR CITY CLUSTERS ────────────────────────────────
 *
 * This used to be four clusters ("Lagos Mainland & Island", "PH, Owerri, Calabar, Warri &
 * Benin", "Other State"). The owner's ask was plain: delivery is decided STATE BY STATE,
 * and he wants to set one fee across many states at once. A cluster is a pricing decision
 * somebody else made and baked in; a state is the unit he actually thinks in, it is what
 * a customer knows they live in, and it is what the bulk control on `/admin/delivery`
 * operates on.
 *
 * ── THESE FEES ARE A STARTING POINT, NOT A PRICING DECISION ─────────────────
 *
 * They are a sane, distance-tiered default so a fresh database never quotes ₦0 and the
 * site is coherent on day one — Lagos cheapest, the South-West next, the far North most.
 * They are meant to be overridden in `/admin/delivery`, in bulk, by the person who knows
 * what a dispatch actually costs. Nothing else in the app reads this file.
 */
export const LOCATIONS: LocationZone[] = [
  { name: "Abia", eta: "3–5 days", fee: 9000 },
  { name: "Adamawa", eta: "5–7 days", fee: 13000 },
  { name: "Akwa Ibom", eta: "3–5 days", fee: 9000 },
  { name: "Anambra", eta: "3–5 days", fee: 9000 },
  { name: "Bauchi", eta: "5–7 days", fee: 13000 },
  { name: "Bayelsa", eta: "3–5 days", fee: 9000 },
  { name: "Benue", eta: "3–5 days", fee: 10000 },
  { name: "Borno", eta: "5–7 days", fee: 14000 },
  { name: "Cross River", eta: "3–5 days", fee: 9000 },
  { name: "Delta", eta: "3–5 days", fee: 8000 },
  { name: "Ebonyi", eta: "3–5 days", fee: 9000 },
  { name: "Edo", eta: "3–5 days", fee: 8000 },
  { name: "Ekiti", eta: "2–4 days", fee: 7000 },
  { name: "Enugu", eta: "3–5 days", fee: 9000 },
  { name: "FCT (Abuja)", eta: "3–5 days", fee: 10000 },
  { name: "Gombe", eta: "5–7 days", fee: 13000 },
  { name: "Imo", eta: "3–5 days", fee: 9000 },
  { name: "Jigawa", eta: "5–7 days", fee: 13000 },
  { name: "Kaduna", eta: "4–6 days", fee: 11000 },
  { name: "Kano", eta: "5–7 days", fee: 12000 },
  { name: "Katsina", eta: "5–7 days", fee: 12000 },
  { name: "Kebbi", eta: "5–7 days", fee: 12000 },
  { name: "Kogi", eta: "3–5 days", fee: 10000 },
  { name: "Kwara", eta: "3–5 days", fee: 9000 },
  { name: "Lagos", eta: "24–48 hours", fee: 4000 },
  { name: "Nasarawa", eta: "3–5 days", fee: 10000 },
  { name: "Niger", eta: "3–5 days", fee: 10000 },
  { name: "Ogun", eta: "2–4 days", fee: 6000 },
  { name: "Ondo", eta: "2–4 days", fee: 7000 },
  { name: "Osun", eta: "2–4 days", fee: 7000 },
  { name: "Oyo", eta: "2–4 days", fee: 7000 },
  { name: "Plateau", eta: "3–5 days", fee: 10000 },
  { name: "Rivers", eta: "3–5 days", fee: 9000 },
  { name: "Sokoto", eta: "5–7 days", fee: 13000 },
  { name: "Taraba", eta: "5–7 days", fee: 13000 },
  { name: "Yobe", eta: "5–7 days", fee: 14000 },
  { name: "Zamfara", eta: "5–7 days", fee: 13000 },
];

export const WHATSAPP_NUMBER = "2347049621694";
