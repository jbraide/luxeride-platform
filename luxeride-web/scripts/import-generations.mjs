/**
 * Import accurate generations from cars-list.md into the database.
 * Updates Vehicle.yearFrom / yearTo and ensures mappings exist.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Read and parse the Toyota data from cars-list.md manually based on source of truth
  const toyotaGenerations = [
    { model: "Camry", yearFrom: 2002, yearTo: 2006, gen: "XV30" },
    { model: "Camry", yearFrom: 2007, yearTo: 2011, gen: "XV40" },
    { model: "Camry", yearFrom: 2012, yearTo: 2017, gen: "XV50" },
    { model: "Camry", yearFrom: 2018, yearTo: 2023, gen: "XV70" },
    { model: "Camry", yearFrom: 2024, yearTo: 2026, gen: "XV80" },
    { model: "Corolla", yearFrom: 2003, yearTo: 2008, gen: "E120/E130" },
    { model: "Corolla", yearFrom: 2009, yearTo: 2013, gen: "E140/E150" },
    { model: "Corolla", yearFrom: 2014, yearTo: 2019, gen: "E170" },
    { model: "Corolla", yearFrom: 2020, yearTo: 2026, gen: "E210" },
    { model: "Highlander", yearFrom: 2001, yearTo: 2007, gen: "1st Gen (2/3-Row)" },
    { model: "Highlander", yearFrom: 2008, yearTo: 2013, gen: "2nd Gen (2/3-Row)" },
    { model: "Highlander", yearFrom: 2014, yearTo: 2019, gen: "3rd Gen (2/3-Row)" },
    { model: "Highlander", yearFrom: 2020, yearTo: 2026, gen: "4th Gen (2/3-Row)" },
    { model: "RAV4", yearFrom: 2006, yearTo: 2012, gen: "3rd Gen" },
    { model: "RAV4", yearFrom: 2013, yearTo: 2018, gen: "4th Gen" },
    { model: "RAV4", yearFrom: 2019, yearTo: 2026, gen: "5th Gen" },
    { model: "Avalon", yearFrom: 2005, yearTo: 2012, gen: "3rd Gen" },
    { model: "Avalon", yearFrom: 2013, yearTo: 2018, gen: "4th Gen" },
    { model: "Avalon", yearFrom: 2019, yearTo: 2022, gen: "5th Gen" },
    { model: "Sienna", yearFrom: 2004, yearTo: 2010, gen: "2nd Gen (3-Row)" },
    { model: "Sienna", yearFrom: 2011, yearTo: 2020, gen: "3rd Gen (3-Row)" },
    { model: "Sienna", yearFrom: 2021, yearTo: 2026, gen: "4th Gen (3-Row)" },
    { model: "Venza", yearFrom: 2009, yearTo: 2015, gen: "1st Gen (2-Row)" },
    { model: "Venza", yearFrom: 2021, yearTo: 2026, gen: "2nd Gen (2-Row)" },
    { model: "Land Cruiser", yearFrom: 2008, yearTo: 2015, gen: "200 Series (3-Row)" },
    { model: "Land Cruiser", yearFrom: 2016, yearTo: 2021, gen: "200 Facelift (3-Row)" },
    { model: "Land Cruiser", yearFrom: 2022, yearTo: 2026, gen: "300 Series (3-Row)" },
    { model: "Land Cruiser Prado", yearFrom: 2010, yearTo: 2017, gen: "150 Series (3-Row)" },
    { model: "Land Cruiser Prado", yearFrom: 2018, yearTo: 2026, gen: "150 Facelift (3-Row)" },
    { model: "4Runner", yearFrom: 2010, yearTo: 2023, gen: "5th Gen (2/3-Row)" },
    { model: "Sequoia", yearFrom: 2008, yearTo: 2022, gen: "2nd Gen (3-Row)" },
    { model: "Sequoia", yearFrom: 2023, yearTo: 2026, gen: "3rd Gen (3-Row)" },
    { model: "Hilux", yearFrom: 2015, yearTo: 2026, gen: "8th Gen (Crew)" },
    { model: "Tacoma", yearFrom: 2016, yearTo: 2023, gen: "3rd Gen" },
    { model: "Tundra", yearFrom: 2014, yearTo: 2021, gen: "2nd Gen" },
    { model: "Tundra", yearFrom: 2022, yearTo: 2026, gen: "3rd Gen" },
  ];

  const allGenerations = [
    // Toyota (source of truth: cars-list.md)
    ...toyotaGenerations,
    // Lexus (Premium)
    ...[
      { brand: "Lexus", model: "RX 330 / 350", yearFrom: 2004, yearTo: 2009, gen: "2nd Gen (2-Row)" },
      { brand: "Lexus", model: "RX 330 / 350", yearFrom: 2010, yearTo: 2015, gen: "3rd Gen (2-Row)" },
      { brand: "Lexus", model: "RX 330 / 350", yearFrom: 2016, yearTo: 2022, gen: "4th Gen (2-Row)" },
      { brand: "Lexus", model: "RX 330 / 350", yearFrom: 2023, yearTo: 2026, gen: "5th Gen (2-Row)" },
      { brand: "Lexus", model: "RX 350L / 450hL", yearFrom: 2018, yearTo: 2022, gen: "4th Gen L (3-Row)" },
      { brand: "Lexus", model: "ES 300 / 330 / 350", yearFrom: 2007, yearTo: 2012, gen: "5th Gen" },
      { brand: "Lexus", model: "ES 300 / 330 / 350", yearFrom: 2013, yearTo: 2018, gen: "6th Gen" },
      { brand: "Lexus", model: "ES 300 / 330 / 350", yearFrom: 2019, yearTo: 2026, gen: "7th Gen" },
      { brand: "Lexus", model: "GX 470 / 460", yearFrom: 2003, yearTo: 2009, gen: "GX 470 (3-Row)" },
      { brand: "Lexus", model: "GX 470 / 460", yearFrom: 2010, yearTo: 2023, gen: "GX 460 (3-Row)" },
      { brand: "Lexus", model: "GX 470 / 460", yearFrom: 2024, yearTo: 2026, gen: "GX 550 (3-Row)" },
      { brand: "Lexus", model: "LX 470 / 570 / 600", yearFrom: 2008, yearTo: 2015, gen: "LX 570 (3-Row)" },
      { brand: "Lexus", model: "LX 470 / 570 / 600", yearFrom: 2016, yearTo: 2021, gen: "LX 570 Facelift (3-Row)" },
      { brand: "Lexus", model: "LX 470 / 570 / 600", yearFrom: 2022, yearTo: 2026, gen: "LX 600 (3-Row)" },
      { brand: "Lexus", model: "NX 200t / 300 / 350", yearFrom: 2015, yearTo: 2021, gen: "1st Gen (2-Row)" },
      { brand: "Lexus", model: "NX 200t / 300 / 350", yearFrom: 2022, yearTo: 2026, gen: "2nd Gen (2-Row)" },
      { brand: "Lexus", model: "UX 200 / 250h", yearFrom: 2019, yearTo: 2026, gen: "1st Gen (2-Row)" },
      { brand: "Lexus", model: "IS 250 / 300 / 350", yearFrom: 2006, yearTo: 2013, gen: "2nd Gen" },
      { brand: "Lexus", model: "IS 250 / 300 / 350", yearFrom: 2014, yearTo: 2020, gen: "3rd Gen" },
      { brand: "Lexus", model: "IS 250 / 300 / 350", yearFrom: 2021, yearTo: 2026, gen: "4th Gen" },
      { brand: "Lexus", model: "LS 460 / 500", yearFrom: 2007, yearTo: 2017, gen: "4th Gen" },
      { brand: "Lexus", model: "LS 460 / 500", yearFrom: 2018, yearTo: 2026, gen: "5th Gen" },
    ].map(i => ({ ...i })),
    // Honda
    ...[
      { brand: "Honda", model: "Accord", yearFrom: 2003, yearTo: 2007, gen: "7th Gen" },
      { brand: "Honda", model: "Accord", yearFrom: 2008, yearTo: 2012, gen: "8th Gen" },
      { brand: "Honda", model: "Accord", yearFrom: 2013, yearTo: 2017, gen: "9th Gen" },
      { brand: "Honda", model: "Accord", yearFrom: 2018, yearTo: 2022, gen: "10th Gen" },
      { brand: "Honda", model: "Accord", yearFrom: 2023, yearTo: 2026, gen: "11th Gen" },
      { brand: "Honda", model: "Civic", yearFrom: 2006, yearTo: 2011, gen: "8th Gen" },
      { brand: "Honda", model: "Civic", yearFrom: 2012, yearTo: 2015, gen: "9th Gen" },
      { brand: "Honda", model: "Civic", yearFrom: 2016, yearTo: 2021, gen: "10th Gen" },
      { brand: "Honda", model: "Civic", yearFrom: 2022, yearTo: 2026, gen: "11th Gen" },
      { brand: "Honda", model: "CR-V", yearFrom: 2007, yearTo: 2011, gen: "3rd Gen" },
      { brand: "Honda", model: "CR-V", yearFrom: 2012, yearTo: 2016, gen: "4th Gen" },
      { brand: "Honda", model: "CR-V", yearFrom: 2017, yearTo: 2022, gen: "5th Gen" },
      { brand: "Honda", model: "CR-V", yearFrom: 2023, yearTo: 2026, gen: "6th Gen" },
      { brand: "Honda", model: "Pilot", yearFrom: 2003, yearTo: 2008, gen: "1st Gen (3-Row)" },
      { brand: "Honda", model: "Pilot", yearFrom: 2009, yearTo: 2015, gen: "2nd Gen (3-Row)" },
      { brand: "Honda", model: "Pilot", yearFrom: 2016, yearTo: 2022, gen: "3rd Gen (3-Row)" },
      { brand: "Honda", model: "Pilot", yearFrom: 2023, yearTo: 2026, gen: "4th Gen (3-Row)" },
      { brand: "Honda", model: "Odyssey", yearFrom: 2005, yearTo: 2010, gen: "3rd Gen (3-Row)" },
      { brand: "Honda", model: "Odyssey", yearFrom: 2011, yearTo: 2017, gen: "4th Gen (3-Row)" },
      { brand: "Honda", model: "Odyssey", yearFrom: 2018, yearTo: 2026, gen: "5th Gen (3-Row)" },
      { brand: "Honda", model: "HR-V", yearFrom: 2016, yearTo: 2022, gen: "1st Gen (2-Row)" },
      { brand: "Honda", model: "HR-V", yearFrom: 2023, yearTo: 2026, gen: "2nd Gen (2-Row)" },
      { brand: "Honda", model: "Passport", yearFrom: 2019, yearTo: 2026, gen: "2nd Gen (2-Row)" },
      { brand: "Honda", model: "Ridgeline", yearFrom: 2017, yearTo: 2026, gen: "2nd Gen (Crew)" },
    ],
    // Hyundai & Kia (simplified from cars-list.md)
    ...[
      { brand: "Hyundai", model: "Santa Fe", yearFrom: 2007, yearTo: 2012, gen: "2nd Gen (2/3-Row)" },
      { brand: "Hyundai", model: "Santa Fe", yearFrom: 2013, yearTo: 2018, gen: "3rd Gen (2/3-Row)" },
      { brand: "Hyundai", model: "Santa Fe", yearFrom: 2019, yearTo: 2026, gen: "4th Gen (2/3-Row)" },
      { brand: "Hyundai", model: "Tucson", yearFrom: 2010, yearTo: 2015, gen: "2nd Gen" },
      { brand: "Hyundai", model: "Tucson", yearFrom: 2016, yearTo: 2020, gen: "3rd Gen" },
      { brand: "Hyundai", model: "Tucson", yearFrom: 2021, yearTo: 2026, gen: "4th Gen" },
      { brand: "Hyundai", model: "Sonata", yearFrom: 2006, yearTo: 2010, gen: "5th Gen" },
      { brand: "Hyundai", model: "Sonata", yearFrom: 2011, yearTo: 2014, gen: "6th Gen" },
      { brand: "Hyundai", model: "Sonata", yearFrom: 2015, yearTo: 2019, gen: "7th Gen" },
      { brand: "Hyundai", model: "Sonata", yearFrom: 2020, yearTo: 2026, gen: "8th Gen" },
      { brand: "Hyundai", model: "Elantra", yearFrom: 2011, yearTo: 2016, gen: "6th Gen" },
      { brand: "Hyundai", model: "Elantra", yearFrom: 2017, yearTo: 2020, gen: "7th Gen" },
      { brand: "Hyundai", model: "Elantra", yearFrom: 2021, yearTo: 2026, gen: "8th Gen" },
      { brand: "Hyundai", model: "Palisade", yearFrom: 2020, yearTo: 2026, gen: "1st Gen (3-Row)" },
      { brand: "Kia", model: "Sorento", yearFrom: 2011, yearTo: 2014, gen: "2nd Gen (2/3-Row)" },
      { brand: "Kia", model: "Sorento", yearFrom: 2015, yearTo: 2020, gen: "3rd Gen (2/3-Row)" },
      { brand: "Kia", model: "Sorento", yearFrom: 2021, yearTo: 2026, gen: "4th Gen (2/3-Row)" },
      { brand: "Kia", model: "Sportage", yearFrom: 2011, yearTo: 2016, gen: "3rd Gen" },
      { brand: "Kia", model: "Sportage", yearFrom: 2017, yearTo: 2022, gen: "4th Gen" },
      { brand: "Kia", model: "Sportage", yearFrom: 2023, yearTo: 2026, gen: "5th Gen" },
      { brand: "Kia", model: "Telluride", yearFrom: 2020, yearTo: 2026, gen: "1st Gen (3-Row)" },
      { brand: "Kia", model: "Carnival", yearFrom: 2015, yearTo: 2021, gen: "3rd Gen / Sedona (3-Row)" },
      { brand: "Kia", model: "Carnival", yearFrom: 2022, yearTo: 2026, gen: "4th Gen (3-Row)" },
      { brand: "Kia", model: "K5 / Optima", yearFrom: 2011, yearTo: 2015, gen: "3rd Gen" },
      { brand: "Kia", model: "K5 / Optima", yearFrom: 2016, yearTo: 2020, gen: "4th Gen" },
      { brand: "Kia", model: "K5 / Optima", yearFrom: 2021, yearTo: 2026, gen: "5th Gen / K5" },
    ],
    // Mercedes-Benz & BMW
    ...[
      { brand: "Mercedes-Benz", model: "C-Class", yearFrom: 2008, yearTo: 2014, gen: "W204" },
      { brand: "Mercedes-Benz", model: "C-Class", yearFrom: 2015, yearTo: 2021, gen: "W205" },
      { brand: "Mercedes-Benz", model: "C-Class", yearFrom: 2022, yearTo: 2026, gen: "W206" },
      { brand: "Mercedes-Benz", model: "E-Class", yearFrom: 2010, yearTo: 2016, gen: "W212" },
      { brand: "Mercedes-Benz", model: "E-Class", yearFrom: 2017, yearTo: 2023, gen: "W213" },
      { brand: "Mercedes-Benz", model: "E-Class", yearFrom: 2024, yearTo: 2026, gen: "W214" },
      { brand: "Mercedes-Benz", model: "S-Class", yearFrom: 2014, yearTo: 2020, gen: "W222" },
      { brand: "Mercedes-Benz", model: "S-Class", yearFrom: 2021, yearTo: 2026, gen: "W223" },
      { brand: "Mercedes-Benz", model: "GLE (formerly ML)", yearFrom: 2012, yearTo: 2015, gen: "ML350 W166" },
      { brand: "Mercedes-Benz", model: "GLE (formerly ML)", yearFrom: 2016, yearTo: 2019, gen: "GLE W166" },
      { brand: "Mercedes-Benz", model: "GLE (formerly ML)", yearFrom: 2020, yearTo: 2026, gen: "GLE W167 (2/3-Row)" },
      { brand: "Mercedes-Benz", model: "GLC", yearFrom: 2016, yearTo: 2022, gen: "1st Gen" },
      { brand: "Mercedes-Benz", model: "GLC", yearFrom: 2023, yearTo: 2026, gen: "2nd Gen" },
      { brand: "Mercedes-Benz", model: "GLS (formerly GL)", yearFrom: 2013, yearTo: 2019, gen: "GL X166 (3-Row)" },
      { brand: "Mercedes-Benz", model: "GLS (formerly GL)", yearFrom: 2020, yearTo: 2026, gen: "GLS X167 (3-Row)" },
      { brand: "Mercedes-Benz", model: "G-Class", yearFrom: 2013, yearTo: 2018, gen: "W463 Facelift" },
      { brand: "Mercedes-Benz", model: "G-Class", yearFrom: 2019, yearTo: 2026, gen: "W463A" },
      { brand: "BMW", model: "3 Series", yearFrom: 2012, yearTo: 2018, gen: "F30" },
      { brand: "BMW", model: "3 Series", yearFrom: 2019, yearTo: 2026, gen: "G20" },
      { brand: "BMW", model: "5 Series", yearFrom: 2011, yearTo: 2016, gen: "F10" },
      { brand: "BMW", model: "5 Series", yearFrom: 2017, yearTo: 2023, gen: "G30" },
      { brand: "BMW", model: "5 Series", yearFrom: 2024, yearTo: 2026, gen: "G60" },
      { brand: "BMW", model: "X3", yearFrom: 2011, yearTo: 2017, gen: "F25" },
      { brand: "BMW", model: "X3", yearFrom: 2018, yearTo: 2026, gen: "G01" },
      { brand: "BMW", model: "X5", yearFrom: 2014, yearTo: 2018, gen: "F15 (2/3-Row)" },
      { brand: "BMW", model: "X5", yearFrom: 2019, yearTo: 2026, gen: "G05 (2/3-Row)" },
      { brand: "BMW", model: "X7", yearFrom: 2019, yearTo: 2026, gen: "G07 (3-Row)" },
    ],
    // Ford & Chevrolet
    ...[
      { brand: "Ford", model: "F-150", yearFrom: 2015, yearTo: 2020, gen: "13th Gen" },
      { brand: "Ford", model: "F-150", yearFrom: 2021, yearTo: 2026, gen: "14th Gen" },
      { brand: "Ford", model: "Explorer", yearFrom: 2011, yearTo: 2019, gen: "5th Gen (3-Row)" },
      { brand: "Ford", model: "Explorer", yearFrom: 2020, yearTo: 2026, gen: "6th Gen (3-Row)" },
      { brand: "Ford", model: "Edge", yearFrom: 2007, yearTo: 2014, gen: "1st Gen" },
      { brand: "Ford", model: "Edge", yearFrom: 2015, yearTo: 2020, gen: "2nd Gen" },
      { brand: "Ford", model: "Edge", yearFrom: 2021, yearTo: 2026, gen: "3rd Gen" },
      { brand: "Ford", model: "Escape", yearFrom: 2013, yearTo: 2019, gen: "3rd Gen" },
      { brand: "Ford", model: "Escape", yearFrom: 2020, yearTo: 2026, gen: "4th Gen" },
      { brand: "Ford", model: "Expedition", yearFrom: 2018, yearTo: 2026, gen: "4th Gen (3-Row)" },
      { brand: "Ford", model: "Bronco", yearFrom: 2021, yearTo: 2026, gen: "6th Gen" },
      { brand: "Chevrolet", model: "Silverado", yearFrom: 2014, yearTo: 2018, gen: "3rd Gen" },
      { brand: "Chevrolet", model: "Silverado", yearFrom: 2019, yearTo: 2026, gen: "4th Gen" },
      { brand: "Chevrolet", model: "Tahoe", yearFrom: 2015, yearTo: 2020, gen: "3rd Gen (3-Row)" },
      { brand: "Chevrolet", model: "Tahoe", yearFrom: 2021, yearTo: 2026, gen: "4th Gen (3-Row)" },
      { brand: "Chevrolet", model: "Suburban", yearFrom: 2015, yearTo: 2020, gen: "3rd Gen (3-Row)" },
      { brand: "Chevrolet", model: "Suburban", yearFrom: 2021, yearTo: 2026, gen: "4th Gen (3-Row)" },
      { brand: "Chevrolet", model: "Traverse", yearFrom: 2018, yearTo: 2026, gen: "2nd Gen (3-Row)" },
      { brand: "Chevrolet", model: "Equinox", yearFrom: 2018, yearTo: 2026, gen: "3rd Gen" },
      { brand: "Chevrolet", model: "Malibu", yearFrom: 2013, yearTo: 2015, gen: "8th Gen" },
      { brand: "Chevrolet", model: "Malibu", yearFrom: 2016, yearTo: 2023, gen: "9th Gen" },
    ],
    // Nissan & Mazda
    ...[
      { brand: "Nissan", model: "Altima", yearFrom: 2007, yearTo: 2012, gen: "4th Gen" },
      { brand: "Nissan", model: "Altima", yearFrom: 2013, yearTo: 2018, gen: "5th Gen" },
      { brand: "Nissan", model: "Altima", yearFrom: 2019, yearTo: 2026, gen: "6th Gen" },
      { brand: "Nissan", model: "Maxima", yearFrom: 2009, yearTo: 2014, gen: "7th Gen" },
      { brand: "Nissan", model: "Maxima", yearFrom: 2015, yearTo: 2023, gen: "8th Gen" },
      { brand: "Nissan", model: "Pathfinder", yearFrom: 2013, yearTo: 2020, gen: "4th Gen (3-Row)" },
      { brand: "Nissan", model: "Pathfinder", yearFrom: 2022, yearTo: 2026, gen: "5th Gen (3-Row)" },
      { brand: "Nissan", model: "Murano", yearFrom: 2009, yearTo: 2014, gen: "3rd Gen" },
      { brand: "Nissan", model: "Murano", yearFrom: 2015, yearTo: 2023, gen: "4th Gen" },
      { brand: "Nissan", model: "Rogue / X-Trail", yearFrom: 2014, yearTo: 2020, gen: "3rd Gen" },
      { brand: "Nissan", model: "Rogue / X-Trail", yearFrom: 2021, yearTo: 2026, gen: "4th Gen" },
      { brand: "Nissan", model: "Armada", yearFrom: 2017, yearTo: 2026, gen: "2nd Gen (3-Row)" },
      { brand: "Mazda", model: "CX-5", yearFrom: 2013, yearTo: 2016, gen: "1st Gen" },
      { brand: "Mazda", model: "CX-5", yearFrom: 2017, yearTo: 2026, gen: "2nd Gen" },
      { brand: "Mazda", model: "CX-9", yearFrom: 2016, yearTo: 2023, gen: "2nd Gen (3-Row)" },
      { brand: "Mazda", model: "CX-50", yearFrom: 2023, yearTo: 2026, gen: "1st Gen" },
      { brand: "Mazda", model: "CX-90", yearFrom: 2024, yearTo: 2026, gen: "1st Gen (3-Row)" },
      { brand: "Mazda", model: "Mazda3", yearFrom: 2014, yearTo: 2018, gen: "3rd Gen" },
      { brand: "Mazda", model: "Mazda3", yearFrom: 2019, yearTo: 2026, gen: "4th Gen" },
      { brand: "Mazda", model: "Mazda6", yearFrom: 2014, yearTo: 2021, gen: "3rd Gen" },
    ],
    // VW, Audi, Jeep, Land Rover, Volvo, Subaru
    ...[
      { brand: "Volkswagen", model: "Tiguan", yearFrom: 2009, yearTo: 2016, gen: "1st Gen" },
      { brand: "Volkswagen", model: "Tiguan", yearFrom: 2018, yearTo: 2024, gen: "2nd Gen (2/3-Row)" },
      { brand: "Volkswagen", model: "Atlas", yearFrom: 2018, yearTo: 2023, gen: "1st Gen (3-Row)" },
      { brand: "Volkswagen", model: "Atlas", yearFrom: 2024, yearTo: 2026, gen: "2nd Gen (3-Row)" },
      { brand: "Volkswagen", model: "Passat", yearFrom: 2012, yearTo: 2019, gen: "B7/NMS" },
      { brand: "Volkswagen", model: "Passat", yearFrom: 2020, yearTo: 2026, gen: "B8" },
      { brand: "Volkswagen", model: "Golf", yearFrom: 2015, yearTo: 2021, gen: "Mk7" },
      { brand: "Volkswagen", model: "Golf", yearFrom: 2022, yearTo: 2026, gen: "Mk8" },
      { brand: "Audi", model: "Q5", yearFrom: 2009, yearTo: 2017, gen: "1st Gen" },
      { brand: "Audi", model: "Q5", yearFrom: 2018, yearTo: 2026, gen: "2nd Gen" },
      { brand: "Audi", model: "Q7", yearFrom: 2007, yearTo: 2015, gen: "1st Gen (3-Row)" },
      { brand: "Audi", model: "Q7", yearFrom: 2016, yearTo: 2026, gen: "2nd Gen (3-Row)" },
      { brand: "Audi", model: "Q8", yearFrom: 2019, yearTo: 2026, gen: "1st Gen" },
      { brand: "Audi", model: "A4", yearFrom: 2009, yearTo: 2015, gen: "B8" },
      { brand: "Audi", model: "A4", yearFrom: 2016, yearTo: 2023, gen: "B9" },
      { brand: "Audi", model: "A6", yearFrom: 2012, yearTo: 2018, gen: "C7" },
      { brand: "Audi", model: "A6", yearFrom: 2019, yearTo: 2026, gen: "C8" },
      { brand: "Jeep", model: "Grand Cherokee", yearFrom: 2011, yearTo: 2021, gen: "4th Gen" },
      { brand: "Jeep", model: "Grand Cherokee", yearFrom: 2022, yearTo: 2026, gen: "5th Gen (2/3-Row)" },
      { brand: "Jeep", model: "Wrangler", yearFrom: 2007, yearTo: 2017, gen: "JK" },
      { brand: "Jeep", model: "Wrangler", yearFrom: 2018, yearTo: 2026, gen: "JL" },
      { brand: "Jeep", model: "Grand Wagoneer", yearFrom: 2022, yearTo: 2026, gen: "1st Gen (3-Row)" },
      { brand: "Land Rover", model: "Range Rover", yearFrom: 2013, yearTo: 2021, gen: "4th Gen (2/3-Row)" },
      { brand: "Land Rover", model: "Range Rover", yearFrom: 2022, yearTo: 2026, gen: "5th Gen (2/3-Row)" },
      { brand: "Land Rover", model: "Range Rover Sport", yearFrom: 2014, yearTo: 2022, gen: "2nd Gen (2/3-Row)" },
      { brand: "Land Rover", model: "Range Rover Sport", yearFrom: 2023, yearTo: 2026, gen: "3rd Gen (2/3-Row)" },
      { brand: "Land Rover", model: "Defender", yearFrom: 2020, yearTo: 2026, gen: "L663 (2/3-Row)" },
      { brand: "Land Rover", model: "Discovery", yearFrom: 2017, yearTo: 2026, gen: "5th Gen (3-Row)" },
      { brand: "Volvo", model: "XC90", yearFrom: 2016, yearTo: 2026, gen: "2nd Gen (3-Row)" },
      { brand: "Volvo", model: "XC60", yearFrom: 2018, yearTo: 2026, gen: "2nd Gen" },
      { brand: "Volvo", model: "XC40", yearFrom: 2019, yearTo: 2026, gen: "1st Gen" },
      { brand: "Subaru", model: "Outback", yearFrom: 2015, yearTo: 2019, gen: "5th Gen" },
      { brand: "Subaru", model: "Outback", yearFrom: 2020, yearTo: 2026, gen: "6th Gen" },
      { brand: "Subaru", model: "Forester", yearFrom: 2014, yearTo: 2018, gen: "4th Gen" },
      { brand: "Subaru", model: "Forester", yearFrom: 2019, yearTo: 2026, gen: "5th Gen" },
      { brand: "Subaru", model: "Ascent", yearFrom: 2019, yearTo: 2026, gen: "1st Gen (3-Row)" },
    ],
  ];

  for (const item of allGenerations) {
    if (!item.model || !item.brand) { console.log('Skipping invalid entry:', item); continue; }
    const makeRow = await prisma.make.findFirst({ where: { name: item.brand } });
    if (!makeRow) {
      console.log(`Make ${item.brand} not found in DB, skipping ${item.model}.`);
      continue;
    }

    // Find or create the Vehicle row by model name
    let vehicle = await prisma.vehicle.findFirst({
      where: { makeId: makeRow.id, model: item.model },
    });

    const existing = await prisma.vehicle.findFirst({
      where: { makeId: makeRow.id, model: item.model, yearFrom: item.yearFrom, yearTo: item.yearTo },
    });
    if (existing) {
      await prisma.vehicle.update({
        where: { id: existing.id },
        data: { generation: item.gen, yearFrom: item.yearFrom, yearTo: item.yearTo, active: true },
      });
      console.log(`Updated Vehicle: ${item.brand} ${item.model} (${item.yearFrom}-${item.yearTo}) gen=${item.gen}`);
    } else {
      await prisma.vehicle.create({
        data: {
          makeId: makeRow.id,
          model: item.model,
          yearFrom: item.yearFrom,
          yearTo: item.yearTo,
          generation: item.gen,
          sourceKey: `${(item.brand || 'other').toLowerCase().replace(/[^a-z0-9]/g, "-")}-${(item.model || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, "-")}-${item.yearFrom}-${item.yearTo}`,
          active: true,
          status: "inferred",
        },
      });
      console.log(`Created Vehicle: ${item.brand} ${item.model} (${item.yearFrom}-${item.yearTo}) gen=${item.gen}`);
    }
  }

  console.log("Import complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
