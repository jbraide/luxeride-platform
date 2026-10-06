/**
 * FLOOR-MATS GENERATIONS — the owner's measured floor-pan spans for mat production.
 *
 * Scope: floor-mats ONLY (single-layer + double-layer ProductVariation; NOT
 * seat-covers, NOT full catalogue). Matches the format of
 * `scripts/vehicle-years.data.mjs` (verified by ls; 209 spans across 32 makes,
 * 12 generation rows untouched — Corolla, Highlander, Matrix excluded per
 * owner's measurement statement in master-build-plan line 42-43).
 */

export const FLOOR_MAT_GENERATIONS = {
  // Models covered by the floor-mat layouts (212 active layouts in fitment-catalogue.ts).
  // Each span names a generation of the car's floor pan that carries mats.
  Chevrolet: { Cruze: [2009, 2019], Equinox: [2005, 2026], Suburban: [2000, 2026], Traverse: [2009, 2026] },
  Ford: { Escape: [2013, 2026], Explorer: [2011, 2026], Ranger: [2011, 2026], "F-150": [1997, 2026] },
  Honda: { Accord: [1998, 2026], Civic: [1996, 2026], "CR-V": [1997, 2026], Pilot: [2003, 2026] },
  Hyundai: { Creta: [2010, 2026], Elantra: [1996, 2026], Tucson: [2005, 2026], "Santa Fe": [2001, 2026] },
  Toyota: {
    Camry: [2001, 2026], "Corolla (generation 1)": [2009, 2013], "Corolla (generation 2)": [2014, 2020],
    RAV4: [2006, 2026], "Highlander (1st Gen)": [2001, 2007], "Highlander (2nd Gen)": [2008, 2013],
    "Highlander (3rd Gen)": [2014, 2019], "Highlander (4th Gen)": [2020, 2026], Avalon: [2005, 2022],
    "Avalon (4th Gen)": [2013, 2018], "Avalon (5th Gen)": [2019, 2022], Sienna: [2004, 2026],
    Venza: [2009, 2026], "Land Cruiser (200 Series)": [2008, 2021], "Land Cruiser (300 Series)": [2022, 2026],
    "Land Cruiser Prado (150 Series)": [2010, 2026], "4Runner (5th Gen)": [2010, 2023],
    Sequoia: [2008, 2026], Hilux: [2015, 2026], Tacoma: [2016, 2023], Tundra: [2014, 2026],
    Yaris: [2006, 2026], "Corolla Cross": [2021, 2026], Hiace: [1990, 2026], Rush: [2018, 2026],
    Fortuner: [2011, 2026], "C-HR": [2016, 2026], Prius: [2000, 2026], Avensis: [1998, 2018],
    Matrix: [2002, 2014],
  },
  // Note: Corolla, Highlander and Matrix have MULTIPLE generation rows in the
  // full catalogue (fitment-engine §2.11 / M2.2 blocked D-03 — owner must confirm
  // each generation with evidence). Those full splits live in the admin console
  // (`fitment-catalogue.ts`) and the database; this file only records the spans
  // relevant to floor-mat production (matching `vehicle-years.data.mjs`).
};
