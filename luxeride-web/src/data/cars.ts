export type Tier = "regular" | "premium";

export interface CarModelFlag {
  name: string;
  available: boolean;
}

export type CarModel = string | CarModelFlag;

export interface Brand {
  tier: Tier;
  available: boolean;
  models: CarModel[];
}

// Ported 1:1 from the validated HTML prototype's CONFIG.BRANDS.
// "available: false" on a brand routes anyone who picks it to the
// "Coming Soon" screen. A model can also be flagged individually
// (e.g. Acura MDX) while the rest of that brand stays open.
export const BRANDS: Record<string, Brand> = {
  Toyota: { tier: "regular", available: true, models: ["Camry", "Corolla", "Corolla Cross", "Avalon", "Yaris", "Venza", "RAV4", "Highlander", "4Runner", "Sequoia", "Land Cruiser", "Land Cruiser Prado", "Hilux", "Sienna", "Hiace", "Rush", "Fortuner", "Avensis", "Matrix", "Prius", "C-HR"] },
  Lexus: { tier: "premium", available: true, models: ["RX 350", "RX 330", "ES 350", "ES 300", "IS 250", "IS 350", "GX 460", "GX 470", "LX 570", "NX 300", "GS 350", "LS 460"] },
  Honda: { tier: "regular", available: true, models: ["Accord", "Civic", "CR-V", "Pilot", "Odyssey", "HR-V", "Passport", "City"] },
  Acura: { tier: "premium", available: true, models: ["TL", "TLX", { name: "MDX", available: false }, "RDX", "ILX", "TSX"] },
  Nissan: { tier: "regular", available: true, models: ["Altima", "Maxima", "Sentra", "Murano", "Pathfinder", "Xterra", "Rogue", "Armada", "Patrol", "Frontier", "Quest"] },
  Infiniti: { tier: "premium", available: true, models: ["QX56", "QX60", "QX70", "G37", "M35", "FX35"] },
  Mazda: { tier: "regular", available: true, models: ["Mazda 3", "Mazda 6", "CX-5", "CX-9"] },
  Mitsubishi: { tier: "regular", available: true, models: ["Montero/Pajero", "Outlander", "Lancer", "L200/Strada", "ASX"] },
  Suzuki: { tier: "regular", available: true, models: ["Grand Vitara", "Vitara", "Jimny", "Swift"] },
  Hyundai: { tier: "regular", available: true, models: ["Elantra", "Sonata", "Accent", "Tucson", "Santa Fe", "Veloster", "i10", "i20", "Creta", "Palisade", "Venue", "Kona"] },
  Kia: { tier: "regular", available: true, models: ["Rio", "Cerato", "Optima/K5", "Sportage", "Sorento", "Soul", "Picanto", "Seltos", "Cadenza", "Sedona"] },
  "Mercedes-Benz": { tier: "premium", available: true, models: ["C-Class", "E-Class", "S-Class", "GLE", "GLC", "GLS", "G-Class", "CLA", "CLS", "A-Class"] },
  BMW: { tier: "premium", available: true, models: ["1 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X6"] },
  Volkswagen: { tier: "regular", available: true, models: ["Golf", "Passat", "Jetta", "Tiguan", "Touareg", "Beetle"] },
  Audi: { tier: "premium", available: true, models: ["A4", "A6", "Q5", "Q7"] },
  Ford: { tier: "regular", available: true, models: ["Focus", "Fusion", "Escape", "Explorer", "Edge", "Expedition", "F-150", "Ranger", "Everest", "EcoSport", "Mustang"] },
  Chevrolet: { tier: "regular", available: true, models: ["Malibu", "Cruze", "Camaro", "Tahoe", "Suburban", "Traverse", "Equinox"] },
  Jeep: { tier: "regular", available: true, models: ["Grand Cherokee", "Cherokee", "Wrangler", "Compass", "Patriot"] },
  "Land Rover": { tier: "premium", available: true, models: ["Range Rover", "Range Rover Sport", "Range Rover Evoque", "Discovery", "Discovery Sport", "Defender", "Freelander"] },
  Peugeot: { tier: "regular", available: true, models: ["504", "505", "406", "407", "408", "508", "3008", "5008", "2008"] },
  Renault: { tier: "regular", available: true, models: ["Duster", "Logan", "Koleos"] },
  Volvo: { tier: "premium", available: true, models: ["XC60", "XC90", "S60", "S80"] },
  GAC: { tier: "regular", available: false, models: ["GS3", "GS4", "GS8", "Emkoo", "M8"] },
  Changan: { tier: "regular", available: false, models: ["Alsvin", "UNI-T", "UNI-K", "CS35 Plus", "CS55 Plus", "CS75 Plus"] },
  Chery: { tier: "regular", available: false, models: ["Tiggo 4", "Tiggo 7", "Tiggo 8", "Tiggo 9", "Omoda 5"] },
  Geely: { tier: "regular", available: false, models: ["Coolray", "Emgrand", "Okavango"] },
  MG: { tier: "regular", available: false, models: ["ZS", "MG5", "HS", "MG3"] },
  Haval: { tier: "regular", available: false, models: ["H6", "Jolion", "H9"] },
  JAC: { tier: "regular", available: false, models: ["S3", "T8", "JS4"] },
  Jetour: { tier: "regular", available: false, models: ["T2", "Dashing", "X70", "X90"] },
  BYD: { tier: "regular", available: false, models: ["Atto 3", "Dolphin", "Seagull", "Seal"] },
  Foton: { tier: "regular", available: false, models: ["Tunland"] },
  Other: { tier: "regular", available: true, models: ["Enter model on WhatsApp"] },
};

export function nameOf(item: CarModel): string {
  return typeof item === "string" ? item : item.name;
}
export function isModelAvailable(item: CarModel): boolean {
  return typeof item === "string" ? true : item.available !== false;
}

export interface FlatCar {
  brand: string;
  model: string;
  available: boolean;
}

export const FLAT_CARS: FlatCar[] = Object.entries(BRANDS).flatMap(([brand, data]) => {
  if (brand === "Other") return [];
  return data.models.map((item) => ({
    brand,
    model: nameOf(item),
    available: data.available !== false && isModelAvailable(item),
  }));
});

export const POPULAR_CARS: [string, string][] = [
  ["Toyota", "Camry"], ["Toyota", "Corolla"], ["Toyota", "Highlander"], ["Toyota", "RAV4"],
  ["Toyota", "Hilux"], ["Lexus", "RX 350"], ["Honda", "Accord"], ["Mercedes-Benz", "C-Class"],
];
