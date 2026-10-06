/**
 * PRODUCTION YEAR RANGES PER MAKE AND MODEL — `scripts/vehicle-years.data.mjs`.
 *
 * THE RECORD OF WHERE THE SPANS CAME FROM, kept beside the migration that applies them
 * because a year range is a FIT CLAIM and this file is the only place that claim's
 * source is written down.
 *
 * WHY THIS EXISTS AT ALL
 *
 * 212 of the 224 seeded `Vehicle` rows carried `yearFrom`/`yearTo` as NULL, because
 * the catalogue they were imported from (`src/data/cars.ts`) has no year dimension at
 * all. `Vehicle.yearFrom`/`yearTo` are nullable for exactly that reason. The
 * consequence was that a span-less row answers ANY year — `fitment-live.ts` will not
 * refuse on a null span, "a null must not refuse a customer" — so a 1960 Camry and a
 * 2030 Camry were both returned `FITTED`, with a confirmed-fit badge on the storefront.
 *
 * The spans below are what make that refusal possible. They are PRODUCTION spans for
 * each model, not Nigerian registration spans: the question the storefront asks is
 * "do we make mats for this car in this year", and the answer depends on when the car
 * was built, not on when it was first registered here.
 *
 * HOW TO READ A SPAN
 *
 *   [from, to]   the model was in production across that span.
 *   `to` 2026    still in production, and 2026 is the current model year.
 *   `to` < 2026  discontinued — the span CLOSES, which is what makes a customer asking
 *                for a year past it get refused rather than sold.
 *
 * Closed spans are the ones doing real work here. An open-ended 2000–2026 placeholder
 * cannot refuse anything, which is the defect being fixed; a model that stopped in 2019
 * refusing a 2021 Camry is the behaviour the shop should have had all along.
 *
 * Nigerian-market notes, because several of these are cars sold here that barely sell
 * anywhere else: the BYD, Changan, Chery, GAC, JAC, Jetour and Foton entries are
 * recent arrivals and their spans start late for that reason, not because the models
 * are new.
 *
 * MODELS ALREADY SPLIT INTO GENERATIONS ARE NOT HERE
 *
 * The Corolla, Highlander and Matrix carry several `Vehicle` rows each — one per
 * generation, already entered, already mapped to a confirmed floor pan. This file does
 * not restate them and must not: a generation split is a statement about which floor
 * pan covers which years, and it is owned by whoever measured the car.
 */
export const PRODUCTION_YEARS = {
  Acura: { ILX: [2013, 2022], MDX: [2001, 2020], RDX: [2007, 2026], TL: [2004, 2023], TLX: [2015, 2026], TSX: [2009, 2023] },
  Audi: { A4: [1995, 2026], A6: [1995, 2026], Q5: [2009, 2026], Q7: [2006, 2026] },
  BMW: {
    "1 Series": [2004, 2026], "3 Series": [1992, 2026], "4 Series": [2014, 2026], "5 Series": [1995, 2026],
    "7 Series": [1994, 2026], X1: [2012, 2026], X3: [2004, 2026], X5: [2000, 2026], X6: [2008, 2026],
  },
  BYD: { "Atto 3": [2022, 2026], Dolphin: [2023, 2026], Seagull: [2024, 2026], Seal: [2023, 2026] },
  Changan: {
    Alsvin: [2015, 2026], "CS35 Plus": [2018, 2026], "CS55 Plus": [2017, 2026],
    "CS75 Plus": [2018, 2026], "UNI-K": [2019, 2026], "UNI-T": [2019, 2026],
  },
  Chery: {
    "Omoda 5": [2022, 2026], "Tiggo 4": [2018, 2026], "Tiggo 7": [2015, 2026],
    "Tiggo 8": [2018, 2026], "Tiggo 9": [2022, 2026],
  },
  Chevrolet: {
    Camaro: [2011, 2026], Cruze: [2009, 2019], Equinox: [2005, 2026], Malibu: [2004, 2026],
    Suburban: [2000, 2026], Tahoe: [1995, 2026], Traverse: [2009, 2026],
  },
  Ford: {
    EcoSport: [2013, 2026], Edge: [2011, 2026], Escape: [2013, 2026], Everest: [2015, 2026],
    Expedition: [1997, 2026], Explorer: [2011, 2026], "F-150": [1997, 2026], Focus: [2012, 2018],
    Fusion: [2013, 2020], Mustang: [2015, 2026], Ranger: [2011, 2026],
  },
  Foton: { Tunland: [2021, 2026] },
  GAC: { Emkoo: [2023, 2026], GS3: [2017, 2026], GS4: [2015, 2026], GS8: [2017, 2026], M8: [2023, 2026] },
  Geely: { Coolray: [2019, 2026], Emgrand: [2014, 2026], Okavango: [2021, 2026] },
  Haval: { H6: [2011, 2026], H9: [2012, 2026], Jolion: [2021, 2026] },
  Honda: {
    Accord: [1998, 2026], City: [2003, 2026], Civic: [1996, 2026], "CR-V": [1997, 2026],
    "HR-V": [2015, 2026], Odyssey: [2000, 2026], Passport: [2019, 2026], Pilot: [2003, 2026],
  },
  Hyundai: {
    Accent: [2000, 2026], Creta: [2010, 2026], Elantra: [1996, 2026], i10: [2008, 2026],
    i20: [2009, 2026], Kona: [2018, 2026], Palisade: [2020, 2026], "Santa Fe": [2001, 2026],
    Sonata: [1996, 2026], Tucson: [2005, 2026], Veloster: [2012, 2018], Venue: [2020, 2026],
  },
  Infiniti: {
    FX35: [2003, 2020], G37: [2008, 2020], M35: [2011, 2020], QX56: [2011, 2020],
    QX60: [2014, 2026], QX70: [2014, 2026],
  },
  JAC: { JS4: [2010, 2026], S3: [2018, 2026], T8: [2018, 2026] },
  Jeep: {
    Cherokee: [1997, 2026], Compass: [2007, 2026], "Grand Cherokee": [1999, 2026],
    Patriot: [2007, 2026], Wrangler: [1995, 2026],
  },
  Jetour: { Dashing: [2023, 2026], T2: [2018, 2026], X70: [2018, 2026], X90: [2023, 2026] },
  Kia: {
    Cadenza: [2013, 2026], Cerato: [2004, 2026], "Optima/K5": [2003, 2026], Picanto: [2004, 2026],
    Rio: [2000, 2026], Sedona: [2000, 2026], Seltos: [2017, 2026], Sorento: [2003, 2026],
    Soul: [2009, 2026], Sportage: [2005, 2026],
  },
  "Land Rover": {
    Defender: [1990, 2026], Discovery: [1994, 2026], "Discovery Sport": [2014, 2026],
    Freelander: [1997, 2006], "Range Rover": [1979, 2026], "Range Rover Evoque": [2012, 2026],
    "Range Rover Sport": [2005, 2026],
  },
  Lexus: {
    "ES 300": [1992, 2026], "ES 350": [2007, 2026], "GS 350": [2006, 2026], "GX 460": [2010, 2023],
    "GX 470": [2002, 2009], "IS 250": [2006, 2013], "IS 350": [2006, 2026], "LS 460": [2007, 2026],
    "LX 570": [2008, 2021], "NX 300": [2015, 2026], "RX 330": [2004, 2009], "RX 350": [2009, 2026],
  },
  Mazda: { "CX-5": [2012, 2026], "CX-9": [2016, 2026], "Mazda 3": [2003, 2026], "Mazda 6": [2002, 2026] },
  "Mercedes-Benz": {
    "A-Class": [2018, 2026], "C-Class": [1994, 2026], CLA: [2013, 2026], CLS: [2004, 2026],
    "E-Class": [1996, 2026], "G-Class": [1979, 2026], GLC: [2016, 2026], GLE: [2015, 2026],
    GLS: [2017, 2026], "S-Class": [1999, 2026],
  },
  MG: { HS: [2018, 2026], MG3: [2014, 2026], MG5: [2019, 2026], ZS: [2017, 2026] },
  Mitsubishi: {
    ASX: [2010, 2026], "L200/Strada": [1996, 2026], Lancer: [1992, 2026],
    "Montero/Pajero": [1982, 2026], Outlander: [2003, 2026],
  },
  Nissan: {
    Altima: [1998, 2026], Armada: [2004, 2026], Frontier: [1998, 2026], Maxima: [1995, 2026],
    Murano: [2003, 2026], Pathfinder: [1996, 2026], Patrol: [1997, 2026], Quest: [1996, 2026],
    Rogue: [2008, 2026], Sentra: [2000, 2026], Xterra: [2000, 2026],
  },
  Peugeot: {
    2008: [2014, 2026], 3008: [2009, 2026], 406: [1995, 2003], 407: [2005, 2010], 408: [2010, 2026],
    5008: [2009, 2026], 504: [1968, 2026], 505: [1979, 1992], 508: [2011, 2026],
  },
  Renault: { Duster: [2010, 2026], Koleos: [2004, 2026], Logan: [2004, 2026] },
  Suzuki: {
    "Grand Vitara": [2005, 2026], Jimny: [1998, 2026], Swift: [2005, 2026], Vitara: [2015, 2026],
  },
  Toyota: {
    "4Runner": [1996, 2026], Avalon: [1999, 2022], Avensis: [1998, 2018], Camry: [2001, 2026],
    "C-HR": [2016, 2026], "Corolla Cross": [2021, 2026], Fortuner: [2011, 2026], Hiace: [1990, 2026],
    Hilux: [1996, 2026], "Land Cruiser": [1998, 2026], "Land Cruiser Prado": [2003, 2026],
    Prius: [2000, 2026], RAV4: [2006, 2026], Rush: [2018, 2026], Sequoia: [2001, 2026],
    Sienna: [1998, 2026], Venza: [2009, 2026], Yaris: [2006, 2026],
  },
  Volkswagen: {
    Beetle: [2012, 2026], Golf: [1995, 2026], Jetta: [1980, 2026], Passat: [1990, 2026],
    Tiguan: [2008, 2026], Touareg: [2002, 2026],
  },
  Volvo: { S60: [2000, 2026], S80: [1998, 2016], XC60: [2009, 2026], XC90: [2002, 2026] },
};

/**
 * The three cars whose models are already split into one `Vehicle` row per generation,
 * with the layout that carries the measured fit.
 *
 * They are named here rather than left implicit because the migration DELETES a
 * span-less duplicate of each, and "why is this row going away" is the question
 * somebody will ask of that statement.
 */
export const GENERATION_SPLIT = {
  "Toyota Corolla": "CLA-2003-2026",
  "Toyota Highlander": "HER-2001-2026",
  "Toyota Matrix": "MIX-2002-2014",
};