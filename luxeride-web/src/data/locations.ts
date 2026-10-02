export interface LocationZone {
  name: string;
  eta: string;
  fee: number;
}

export const LOCATIONS: LocationZone[] = [
  { name: "Lagos Mainland & Island", eta: "24–48 hours", fee: 9000 },
  { name: "Abuja Central & Outskirts", eta: "3–5 days", fee: 6000 },
  { name: "PH, Owerri, Calabar, Warri & Benin", eta: "3–5 days", fee: 12000 },
  { name: "Other State", eta: "5–7 days", fee: 12000 },
];

export const WHATSAPP_NUMBER = "2347049621694";
