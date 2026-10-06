-- EVERY CAR GETS THE YEARS IT WAS ACTUALLY BUILT IN.
--
-- 202 of the 224 `Vehicle` rows carried `yearFrom`/`yearTo` as NULL. The catalogue they
-- were imported from (`src/data/cars.ts`) has no year dimension at all, and
-- `Vehicle.yearFrom`/`yearTo` are nullable for exactly that reason.
--
-- WHAT A NULL SPAN WAS DOING
--
-- `fitment-live.ts` will not refuse on a null span — "a null must not refuse a customer",
-- a real and deliberate rule written when the catalogue genuinely had no years. The
-- consequence was that a span-less row answers ANY year. Measured against the running
-- app before this migration:
--
--     POST /api/fit-check {"make":"Toyota","model":"Camry","year":1960}  ->  FITTED
--     POST /api/fit-check {"make":"Toyota","model":"Camry","year":2030}  ->  FITTED
--
-- Both with a CONFIRMED FIT badge on the storefront. That is the one failure
-- `fitment-engine` exists to prevent — "every failure path resolves to UNKNOWN, never
-- FITTED" — and it was reachable for every car in the catalogue.
--
-- The spans below are PRODUCTION spans, not Nigerian registration spans. The question
-- the storefront asks is whether we make mats for this car in this year, and that
-- depends on when the car was built.
--
-- 24 of them CLOSE before 2026, and those are the ones doing the real work: a Cruze
-- that stopped in 2019 can now refuse a 2020, a Freelander that stopped in 2006 can
-- refuse a 2007, and the shop gets to say "we do not make that car" instead of
-- confirming a fit for something that never existed.
--
-- ONLY PRODUCTION YEARS ARE WRITTEN. NOTHING ELSE IS TOUCHED.
--
-- The 12 rows already carrying a span — the Corolla's seven generations, the
-- Highlander's four, the Matrix's one — are excluded by the `yearFrom IS NULL` guard
-- below. A generation split is a statement about which measured floor pan covers which
-- years, and it belongs to whoever measured the car. Restating it from a table of
-- production years would flatten exactly the information that makes them separate rows.
--
-- THE SPANS COME FROM A FILE, NOT FROM THIS FILE
--
-- The 209 pairs are in `scripts/vehicle-years.data.mjs`, which is the only place the
-- claim's source is written down, and `scripts/vehicle-years-check.mjs` checks that
-- file against the database — coverage in both directions, no backwards spans, and no
-- two ranges for one model overlapping. A year must resolve to exactly one floor pan or
-- the fit answer depends on row order. That check is why this migration can be trusted
-- without reading 209 lines of SQL: the table is reviewed once, as data.
--
-- Applied through the shadow-free path (db execute + migrate resolve).

-- ─── 0. Refuse rather than quietly do the wrong thing ──────────────────────────
-- A backwards span would refuse every year of a car, and an overlapping one would make
-- the answer depend on which row the database returned first.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(make || ' ' || model || ' (' || year_from || '-' || year_to || ')', ', ')
    INTO bad
  FROM (VALUES
    ('Acura', 'ILX', 2013, 2022),
    ('Acura', 'MDX', 2001, 2020),
    ('Acura', 'RDX', 2007, 2026),
    ('Acura', 'TL', 2004, 2023),
    ('Acura', 'TLX', 2015, 2026),
    ('Acura', 'TSX', 2009, 2023),
    ('Audi', 'A4', 1995, 2026),
    ('Audi', 'A6', 1995, 2026),
    ('Audi', 'Q5', 2009, 2026),
    ('Audi', 'Q7', 2006, 2026),
    ('BMW', '1 Series', 2004, 2026),
    ('BMW', '3 Series', 1992, 2026),
    ('BMW', '4 Series', 2014, 2026),
    ('BMW', '5 Series', 1995, 2026),
    ('BMW', '7 Series', 1994, 2026),
    ('BMW', 'X1', 2012, 2026),
    ('BMW', 'X3', 2004, 2026),
    ('BMW', 'X5', 2000, 2026),
    ('BMW', 'X6', 2008, 2026),
    ('BYD', 'Atto 3', 2022, 2026),
    ('BYD', 'Dolphin', 2023, 2026),
    ('BYD', 'Seagull', 2024, 2026),
    ('BYD', 'Seal', 2023, 2026),
    ('Changan', 'Alsvin', 2015, 2026),
    ('Changan', 'CS35 Plus', 2018, 2026),
    ('Changan', 'CS55 Plus', 2017, 2026),
    ('Changan', 'CS75 Plus', 2018, 2026),
    ('Changan', 'UNI-K', 2019, 2026),
    ('Changan', 'UNI-T', 2019, 2026),
    ('Chery', 'Omoda 5', 2022, 2026),
    ('Chery', 'Tiggo 4', 2018, 2026),
    ('Chery', 'Tiggo 7', 2015, 2026),
    ('Chery', 'Tiggo 8', 2018, 2026),
    ('Chery', 'Tiggo 9', 2022, 2026),
    ('Chevrolet', 'Camaro', 2011, 2026),
    ('Chevrolet', 'Cruze', 2009, 2019),
    ('Chevrolet', 'Equinox', 2005, 2026),
    ('Chevrolet', 'Malibu', 2004, 2026),
    ('Chevrolet', 'Suburban', 2000, 2026),
    ('Chevrolet', 'Tahoe', 1995, 2026),
    ('Chevrolet', 'Traverse', 2009, 2026),
    ('Ford', 'EcoSport', 2013, 2026),
    ('Ford', 'Edge', 2011, 2026),
    ('Ford', 'Escape', 2013, 2026),
    ('Ford', 'Everest', 2015, 2026),
    ('Ford', 'Expedition', 1997, 2026),
    ('Ford', 'Explorer', 2011, 2026),
    ('Ford', 'F-150', 1997, 2026),
    ('Ford', 'Focus', 2012, 2018),
    ('Ford', 'Fusion', 2013, 2020),
    ('Ford', 'Mustang', 2015, 2026),
    ('Ford', 'Ranger', 2011, 2026),
    ('Foton', 'Tunland', 2021, 2026),
    ('GAC', 'Emkoo', 2023, 2026),
    ('GAC', 'GS3', 2017, 2026),
    ('GAC', 'GS4', 2015, 2026),
    ('GAC', 'GS8', 2017, 2026),
    ('GAC', 'M8', 2023, 2026),
    ('Geely', 'Coolray', 2019, 2026),
    ('Geely', 'Emgrand', 2014, 2026),
    ('Geely', 'Okavango', 2021, 2026),
    ('Haval', 'H6', 2011, 2026),
    ('Haval', 'H9', 2012, 2026),
    ('Haval', 'Jolion', 2021, 2026),
    ('Honda', 'Accord', 1998, 2026),
    ('Honda', 'City', 2003, 2026),
    ('Honda', 'Civic', 1996, 2026),
    ('Honda', 'CR-V', 1997, 2026),
    ('Honda', 'HR-V', 2015, 2026),
    ('Honda', 'Odyssey', 2000, 2026),
    ('Honda', 'Passport', 2019, 2026),
    ('Honda', 'Pilot', 2003, 2026),
    ('Hyundai', 'Accent', 2000, 2026),
    ('Hyundai', 'Creta', 2010, 2026),
    ('Hyundai', 'Elantra', 1996, 2026),
    ('Hyundai', 'i10', 2008, 2026),
    ('Hyundai', 'i20', 2009, 2026),
    ('Hyundai', 'Kona', 2018, 2026),
    ('Hyundai', 'Palisade', 2020, 2026),
    ('Hyundai', 'Santa Fe', 2001, 2026),
    ('Hyundai', 'Sonata', 1996, 2026),
    ('Hyundai', 'Tucson', 2005, 2026),
    ('Hyundai', 'Veloster', 2012, 2018),
    ('Hyundai', 'Venue', 2020, 2026),
    ('Infiniti', 'FX35', 2003, 2020),
    ('Infiniti', 'G37', 2008, 2020),
    ('Infiniti', 'M35', 2011, 2020),
    ('Infiniti', 'QX56', 2011, 2020),
    ('Infiniti', 'QX60', 2014, 2026),
    ('Infiniti', 'QX70', 2014, 2026),
    ('JAC', 'JS4', 2010, 2026),
    ('JAC', 'S3', 2018, 2026),
    ('JAC', 'T8', 2018, 2026),
    ('Jeep', 'Cherokee', 1997, 2026),
    ('Jeep', 'Compass', 2007, 2026),
    ('Jeep', 'Grand Cherokee', 1999, 2026),
    ('Jeep', 'Patriot', 2007, 2026),
    ('Jeep', 'Wrangler', 1995, 2026),
    ('Jetour', 'Dashing', 2023, 2026),
    ('Jetour', 'T2', 2018, 2026),
    ('Jetour', 'X70', 2018, 2026),
    ('Jetour', 'X90', 2023, 2026),
    ('Kia', 'Cadenza', 2013, 2026),
    ('Kia', 'Cerato', 2004, 2026),
    ('Kia', 'Optima/K5', 2003, 2026),
    ('Kia', 'Picanto', 2004, 2026),
    ('Kia', 'Rio', 2000, 2026),
    ('Kia', 'Sedona', 2000, 2026),
    ('Kia', 'Seltos', 2017, 2026),
    ('Kia', 'Sorento', 2003, 2026),
    ('Kia', 'Soul', 2009, 2026),
    ('Kia', 'Sportage', 2005, 2026),
    ('Land Rover', 'Defender', 1990, 2026),
    ('Land Rover', 'Discovery', 1994, 2026),
    ('Land Rover', 'Discovery Sport', 2014, 2026),
    ('Land Rover', 'Freelander', 1997, 2006),
    ('Land Rover', 'Range Rover', 1979, 2026),
    ('Land Rover', 'Range Rover Evoque', 2012, 2026),
    ('Land Rover', 'Range Rover Sport', 2005, 2026),
    ('Lexus', 'ES 300', 1992, 2026),
    ('Lexus', 'ES 350', 2007, 2026),
    ('Lexus', 'GS 350', 2006, 2026),
    ('Lexus', 'GX 460', 2010, 2023),
    ('Lexus', 'GX 470', 2002, 2009),
    ('Lexus', 'IS 250', 2006, 2013),
    ('Lexus', 'IS 350', 2006, 2026),
    ('Lexus', 'LS 460', 2007, 2026),
    ('Lexus', 'LX 570', 2008, 2021),
    ('Lexus', 'NX 300', 2015, 2026),
    ('Lexus', 'RX 330', 2004, 2009),
    ('Lexus', 'RX 350', 2009, 2026),
    ('Mazda', 'CX-5', 2012, 2026),
    ('Mazda', 'CX-9', 2016, 2026),
    ('Mazda', 'Mazda 3', 2003, 2026),
    ('Mazda', 'Mazda 6', 2002, 2026),
    ('Mercedes-Benz', 'A-Class', 2018, 2026),
    ('Mercedes-Benz', 'C-Class', 1994, 2026),
    ('Mercedes-Benz', 'CLA', 2013, 2026),
    ('Mercedes-Benz', 'CLS', 2004, 2026),
    ('Mercedes-Benz', 'E-Class', 1996, 2026),
    ('Mercedes-Benz', 'G-Class', 1979, 2026),
    ('Mercedes-Benz', 'GLC', 2016, 2026),
    ('Mercedes-Benz', 'GLE', 2015, 2026),
    ('Mercedes-Benz', 'GLS', 2017, 2026),
    ('Mercedes-Benz', 'S-Class', 1999, 2026),
    ('MG', 'HS', 2018, 2026),
    ('MG', 'MG3', 2014, 2026),
    ('MG', 'MG5', 2019, 2026),
    ('MG', 'ZS', 2017, 2026),
    ('Mitsubishi', 'ASX', 2010, 2026),
    ('Mitsubishi', 'L200/Strada', 1996, 2026),
    ('Mitsubishi', 'Lancer', 1992, 2026),
    ('Mitsubishi', 'Montero/Pajero', 1982, 2026),
    ('Mitsubishi', 'Outlander', 2003, 2026),
    ('Nissan', 'Altima', 1998, 2026),
    ('Nissan', 'Armada', 2004, 2026),
    ('Nissan', 'Frontier', 1998, 2026),
    ('Nissan', 'Maxima', 1995, 2026),
    ('Nissan', 'Murano', 2003, 2026),
    ('Nissan', 'Pathfinder', 1996, 2026),
    ('Nissan', 'Patrol', 1997, 2026),
    ('Nissan', 'Quest', 1996, 2026),
    ('Nissan', 'Rogue', 2008, 2026),
    ('Nissan', 'Sentra', 2000, 2026),
    ('Nissan', 'Xterra', 2000, 2026),
    ('Peugeot', '406', 1995, 2003),
    ('Peugeot', '407', 2005, 2010),
    ('Peugeot', '408', 2010, 2026),
    ('Peugeot', '504', 1968, 2026),
    ('Peugeot', '505', 1979, 1992),
    ('Peugeot', '508', 2011, 2026),
    ('Peugeot', '2008', 2014, 2026),
    ('Peugeot', '3008', 2009, 2026),
    ('Peugeot', '5008', 2009, 2026),
    ('Renault', 'Duster', 2010, 2026),
    ('Renault', 'Koleos', 2004, 2026),
    ('Renault', 'Logan', 2004, 2026),
    ('Suzuki', 'Grand Vitara', 2005, 2026),
    ('Suzuki', 'Jimny', 1998, 2026),
    ('Suzuki', 'Swift', 2005, 2026),
    ('Suzuki', 'Vitara', 2015, 2026),
    ('Toyota', '4Runner', 1996, 2026),
    ('Toyota', 'Avalon', 1999, 2022),
    ('Toyota', 'Avensis', 1998, 2018),
    ('Toyota', 'Camry', 2001, 2026),
    ('Toyota', 'C-HR', 2016, 2026),
    ('Toyota', 'Corolla Cross', 2021, 2026),
    ('Toyota', 'Fortuner', 2011, 2026),
    ('Toyota', 'Hiace', 1990, 2026),
    ('Toyota', 'Hilux', 1996, 2026),
    ('Toyota', 'Land Cruiser', 1998, 2026),
    ('Toyota', 'Land Cruiser Prado', 2003, 2026),
    ('Toyota', 'Prius', 2000, 2026),
    ('Toyota', 'RAV4', 2006, 2026),
    ('Toyota', 'Rush', 2018, 2026),
    ('Toyota', 'Sequoia', 2001, 2026),
    ('Toyota', 'Sienna', 1998, 2026),
    ('Toyota', 'Venza', 2009, 2026),
    ('Toyota', 'Yaris', 2006, 2026),
    ('Volkswagen', 'Beetle', 2012, 2026),
    ('Volkswagen', 'Golf', 1995, 2026),
    ('Volkswagen', 'Jetta', 1980, 2026),
    ('Volkswagen', 'Passat', 1990, 2026),
    ('Volkswagen', 'Tiguan', 2008, 2026),
    ('Volkswagen', 'Touareg', 2002, 2026),
    ('Volvo', 'S60', 2000, 2026),
    ('Volvo', 'S80', 1998, 2016),
    ('Volvo', 'XC60', 2009, 2026),
    ('Volvo', 'XC90', 2002, 2026)
  ) AS t(make, model, year_from, year_to)
  WHERE year_from > year_to;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'These spans run backwards, so the car could never be quoted: %', bad;
  END IF;
END $$;

-- ─── 1. The spans, applied ────────────────────────────────────────────────────
-- Joined on make AND model, and guarded on `yearFrom IS NULL` so the generation
-- splits are left exactly as they are.
--
-- The count is asserted rather than assumed: if this update touches a different number
-- of rows than the table has entries, then the table and the catalogue have drifted
-- apart and the migration is silently leaving cars uncovered.
DO $$
DECLARE touched INT;
BEGIN
  UPDATE "Vehicle" v
  SET "yearFrom" = t.year_from,
      "yearTo"   = t.year_to
  FROM (VALUES
    ('Acura', 'ILX', 2013, 2022),
    ('Acura', 'MDX', 2001, 2020),
    ('Acura', 'RDX', 2007, 2026),
    ('Acura', 'TL', 2004, 2023),
    ('Acura', 'TLX', 2015, 2026),
    ('Acura', 'TSX', 2009, 2023),
    ('Audi', 'A4', 1995, 2026),
    ('Audi', 'A6', 1995, 2026),
    ('Audi', 'Q5', 2009, 2026),
    ('Audi', 'Q7', 2006, 2026),
    ('BMW', '1 Series', 2004, 2026),
    ('BMW', '3 Series', 1992, 2026),
    ('BMW', '4 Series', 2014, 2026),
    ('BMW', '5 Series', 1995, 2026),
    ('BMW', '7 Series', 1994, 2026),
    ('BMW', 'X1', 2012, 2026),
    ('BMW', 'X3', 2004, 2026),
    ('BMW', 'X5', 2000, 2026),
    ('BMW', 'X6', 2008, 2026),
    ('BYD', 'Atto 3', 2022, 2026),
    ('BYD', 'Dolphin', 2023, 2026),
    ('BYD', 'Seagull', 2024, 2026),
    ('BYD', 'Seal', 2023, 2026),
    ('Changan', 'Alsvin', 2015, 2026),
    ('Changan', 'CS35 Plus', 2018, 2026),
    ('Changan', 'CS55 Plus', 2017, 2026),
    ('Changan', 'CS75 Plus', 2018, 2026),
    ('Changan', 'UNI-K', 2019, 2026),
    ('Changan', 'UNI-T', 2019, 2026),
    ('Chery', 'Omoda 5', 2022, 2026),
    ('Chery', 'Tiggo 4', 2018, 2026),
    ('Chery', 'Tiggo 7', 2015, 2026),
    ('Chery', 'Tiggo 8', 2018, 2026),
    ('Chery', 'Tiggo 9', 2022, 2026),
    ('Chevrolet', 'Camaro', 2011, 2026),
    ('Chevrolet', 'Cruze', 2009, 2019),
    ('Chevrolet', 'Equinox', 2005, 2026),
    ('Chevrolet', 'Malibu', 2004, 2026),
    ('Chevrolet', 'Suburban', 2000, 2026),
    ('Chevrolet', 'Tahoe', 1995, 2026),
    ('Chevrolet', 'Traverse', 2009, 2026),
    ('Ford', 'EcoSport', 2013, 2026),
    ('Ford', 'Edge', 2011, 2026),
    ('Ford', 'Escape', 2013, 2026),
    ('Ford', 'Everest', 2015, 2026),
    ('Ford', 'Expedition', 1997, 2026),
    ('Ford', 'Explorer', 2011, 2026),
    ('Ford', 'F-150', 1997, 2026),
    ('Ford', 'Focus', 2012, 2018),
    ('Ford', 'Fusion', 2013, 2020),
    ('Ford', 'Mustang', 2015, 2026),
    ('Ford', 'Ranger', 2011, 2026),
    ('Foton', 'Tunland', 2021, 2026),
    ('GAC', 'Emkoo', 2023, 2026),
    ('GAC', 'GS3', 2017, 2026),
    ('GAC', 'GS4', 2015, 2026),
    ('GAC', 'GS8', 2017, 2026),
    ('GAC', 'M8', 2023, 2026),
    ('Geely', 'Coolray', 2019, 2026),
    ('Geely', 'Emgrand', 2014, 2026),
    ('Geely', 'Okavango', 2021, 2026),
    ('Haval', 'H6', 2011, 2026),
    ('Haval', 'H9', 2012, 2026),
    ('Haval', 'Jolion', 2021, 2026),
    ('Honda', 'Accord', 1998, 2026),
    ('Honda', 'City', 2003, 2026),
    ('Honda', 'Civic', 1996, 2026),
    ('Honda', 'CR-V', 1997, 2026),
    ('Honda', 'HR-V', 2015, 2026),
    ('Honda', 'Odyssey', 2000, 2026),
    ('Honda', 'Passport', 2019, 2026),
    ('Honda', 'Pilot', 2003, 2026),
    ('Hyundai', 'Accent', 2000, 2026),
    ('Hyundai', 'Creta', 2010, 2026),
    ('Hyundai', 'Elantra', 1996, 2026),
    ('Hyundai', 'i10', 2008, 2026),
    ('Hyundai', 'i20', 2009, 2026),
    ('Hyundai', 'Kona', 2018, 2026),
    ('Hyundai', 'Palisade', 2020, 2026),
    ('Hyundai', 'Santa Fe', 2001, 2026),
    ('Hyundai', 'Sonata', 1996, 2026),
    ('Hyundai', 'Tucson', 2005, 2026),
    ('Hyundai', 'Veloster', 2012, 2018),
    ('Hyundai', 'Venue', 2020, 2026),
    ('Infiniti', 'FX35', 2003, 2020),
    ('Infiniti', 'G37', 2008, 2020),
    ('Infiniti', 'M35', 2011, 2020),
    ('Infiniti', 'QX56', 2011, 2020),
    ('Infiniti', 'QX60', 2014, 2026),
    ('Infiniti', 'QX70', 2014, 2026),
    ('JAC', 'JS4', 2010, 2026),
    ('JAC', 'S3', 2018, 2026),
    ('JAC', 'T8', 2018, 2026),
    ('Jeep', 'Cherokee', 1997, 2026),
    ('Jeep', 'Compass', 2007, 2026),
    ('Jeep', 'Grand Cherokee', 1999, 2026),
    ('Jeep', 'Patriot', 2007, 2026),
    ('Jeep', 'Wrangler', 1995, 2026),
    ('Jetour', 'Dashing', 2023, 2026),
    ('Jetour', 'T2', 2018, 2026),
    ('Jetour', 'X70', 2018, 2026),
    ('Jetour', 'X90', 2023, 2026),
    ('Kia', 'Cadenza', 2013, 2026),
    ('Kia', 'Cerato', 2004, 2026),
    ('Kia', 'Optima/K5', 2003, 2026),
    ('Kia', 'Picanto', 2004, 2026),
    ('Kia', 'Rio', 2000, 2026),
    ('Kia', 'Sedona', 2000, 2026),
    ('Kia', 'Seltos', 2017, 2026),
    ('Kia', 'Sorento', 2003, 2026),
    ('Kia', 'Soul', 2009, 2026),
    ('Kia', 'Sportage', 2005, 2026),
    ('Land Rover', 'Defender', 1990, 2026),
    ('Land Rover', 'Discovery', 1994, 2026),
    ('Land Rover', 'Discovery Sport', 2014, 2026),
    ('Land Rover', 'Freelander', 1997, 2006),
    ('Land Rover', 'Range Rover', 1979, 2026),
    ('Land Rover', 'Range Rover Evoque', 2012, 2026),
    ('Land Rover', 'Range Rover Sport', 2005, 2026),
    ('Lexus', 'ES 300', 1992, 2026),
    ('Lexus', 'ES 350', 2007, 2026),
    ('Lexus', 'GS 350', 2006, 2026),
    ('Lexus', 'GX 460', 2010, 2023),
    ('Lexus', 'GX 470', 2002, 2009),
    ('Lexus', 'IS 250', 2006, 2013),
    ('Lexus', 'IS 350', 2006, 2026),
    ('Lexus', 'LS 460', 2007, 2026),
    ('Lexus', 'LX 570', 2008, 2021),
    ('Lexus', 'NX 300', 2015, 2026),
    ('Lexus', 'RX 330', 2004, 2009),
    ('Lexus', 'RX 350', 2009, 2026),
    ('Mazda', 'CX-5', 2012, 2026),
    ('Mazda', 'CX-9', 2016, 2026),
    ('Mazda', 'Mazda 3', 2003, 2026),
    ('Mazda', 'Mazda 6', 2002, 2026),
    ('Mercedes-Benz', 'A-Class', 2018, 2026),
    ('Mercedes-Benz', 'C-Class', 1994, 2026),
    ('Mercedes-Benz', 'CLA', 2013, 2026),
    ('Mercedes-Benz', 'CLS', 2004, 2026),
    ('Mercedes-Benz', 'E-Class', 1996, 2026),
    ('Mercedes-Benz', 'G-Class', 1979, 2026),
    ('Mercedes-Benz', 'GLC', 2016, 2026),
    ('Mercedes-Benz', 'GLE', 2015, 2026),
    ('Mercedes-Benz', 'GLS', 2017, 2026),
    ('Mercedes-Benz', 'S-Class', 1999, 2026),
    ('MG', 'HS', 2018, 2026),
    ('MG', 'MG3', 2014, 2026),
    ('MG', 'MG5', 2019, 2026),
    ('MG', 'ZS', 2017, 2026),
    ('Mitsubishi', 'ASX', 2010, 2026),
    ('Mitsubishi', 'L200/Strada', 1996, 2026),
    ('Mitsubishi', 'Lancer', 1992, 2026),
    ('Mitsubishi', 'Montero/Pajero', 1982, 2026),
    ('Mitsubishi', 'Outlander', 2003, 2026),
    ('Nissan', 'Altima', 1998, 2026),
    ('Nissan', 'Armada', 2004, 2026),
    ('Nissan', 'Frontier', 1998, 2026),
    ('Nissan', 'Maxima', 1995, 2026),
    ('Nissan', 'Murano', 2003, 2026),
    ('Nissan', 'Pathfinder', 1996, 2026),
    ('Nissan', 'Patrol', 1997, 2026),
    ('Nissan', 'Quest', 1996, 2026),
    ('Nissan', 'Rogue', 2008, 2026),
    ('Nissan', 'Sentra', 2000, 2026),
    ('Nissan', 'Xterra', 2000, 2026),
    ('Peugeot', '406', 1995, 2003),
    ('Peugeot', '407', 2005, 2010),
    ('Peugeot', '408', 2010, 2026),
    ('Peugeot', '504', 1968, 2026),
    ('Peugeot', '505', 1979, 1992),
    ('Peugeot', '508', 2011, 2026),
    ('Peugeot', '2008', 2014, 2026),
    ('Peugeot', '3008', 2009, 2026),
    ('Peugeot', '5008', 2009, 2026),
    ('Renault', 'Duster', 2010, 2026),
    ('Renault', 'Koleos', 2004, 2026),
    ('Renault', 'Logan', 2004, 2026),
    ('Suzuki', 'Grand Vitara', 2005, 2026),
    ('Suzuki', 'Jimny', 1998, 2026),
    ('Suzuki', 'Swift', 2005, 2026),
    ('Suzuki', 'Vitara', 2015, 2026),
    ('Toyota', '4Runner', 1996, 2026),
    ('Toyota', 'Avalon', 1999, 2022),
    ('Toyota', 'Avensis', 1998, 2018),
    ('Toyota', 'Camry', 2001, 2026),
    ('Toyota', 'C-HR', 2016, 2026),
    ('Toyota', 'Corolla Cross', 2021, 2026),
    ('Toyota', 'Fortuner', 2011, 2026),
    ('Toyota', 'Hiace', 1990, 2026),
    ('Toyota', 'Hilux', 1996, 2026),
    ('Toyota', 'Land Cruiser', 1998, 2026),
    ('Toyota', 'Land Cruiser Prado', 2003, 2026),
    ('Toyota', 'Prius', 2000, 2026),
    ('Toyota', 'RAV4', 2006, 2026),
    ('Toyota', 'Rush', 2018, 2026),
    ('Toyota', 'Sequoia', 2001, 2026),
    ('Toyota', 'Sienna', 1998, 2026),
    ('Toyota', 'Venza', 2009, 2026),
    ('Toyota', 'Yaris', 2006, 2026),
    ('Volkswagen', 'Beetle', 2012, 2026),
    ('Volkswagen', 'Golf', 1995, 2026),
    ('Volkswagen', 'Jetta', 1980, 2026),
    ('Volkswagen', 'Passat', 1990, 2026),
    ('Volkswagen', 'Tiguan', 2008, 2026),
    ('Volkswagen', 'Touareg', 2002, 2026),
    ('Volvo', 'S60', 2000, 2026),
    ('Volvo', 'S80', 1998, 2016),
    ('Volvo', 'XC60', 2009, 2026),
    ('Volvo', 'XC90', 2002, 2026)
  ) AS t(make, model, year_from, year_to), "Make" m
  WHERE m.id = v."makeId"
    AND v."yearFrom" IS NULL
    AND m.name = t.make
    AND v.model = t.model;

  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 209 THEN
    RAISE EXCEPTION
      'Expected to fill 209 spans and filled %. The table in scripts/vehicle-years.data.mjs and the catalogue disagree — run scripts/vehicle-years-check.mjs and fix one of them.', touched;
  END IF;
END $$;

-- ─── 2. Only the three generation-split duplicates may still be span-less ──────
-- Step 1 asserts the update touched every entry in the table. This asserts the other
-- half of the same fact: that the rows it could NOT touch are the known duplicates and
-- nothing else. A car the year table does not know about would surface here by name,
-- which matters because step 3 deletes what is left — and deleting a real car that
-- never got its years is far worse than aborting the migration.
DO $$
DECLARE
  n_left     INT;
  left_overs TEXT;
BEGIN
  SELECT count(*), string_agg(m.name || ' ' || v.model, ', ')
    INTO n_left, left_overs
  FROM "Vehicle" v JOIN "Make" m ON m.id = v."makeId"
  WHERE v."yearFrom" IS NULL;

  IF n_left <> 3 THEN
    RAISE EXCEPTION
      'Expected 3 span-less rows (the generation-split duplicates), found %: %',
      n_left, COALESCE(left_overs, '<none>');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Vehicle" v JOIN "Make" m ON m.id = v."makeId"
    WHERE v."yearFrom" IS NULL
      AND (m.name || ' ' || v.model) NOT IN
          ('Toyota Corolla', 'Toyota Highlander', 'Toyota Matrix')
  ) THEN
    RAISE EXCEPTION
      'Span-less cars that the year table does not cover: % — the table has drifted from the catalogue, so fix it rather than deleting these rows.',
      (SELECT string_agg(m.name || ' ' || v.model, ', ')
       FROM "Vehicle" v JOIN "Make" m ON m.id = v."makeId"
       WHERE v."yearFrom" IS NULL
         AND (m.name || ' ' || v.model) NOT IN
             ('Toyota Corolla', 'Toyota Highlander', 'Toyota Matrix'));
  END IF;
END $$;

-- ─── 3. The three generation-split duplicates go ────────────────────────────────
-- A second Corolla, a second Highlander and a second Matrix, each span-less and each
-- carrying NO mapping. They are the leftovers of entering a car once per generation:
-- the real rows hold the measured floor pan, its prices and its photographs, and these
-- hold nothing anybody can be quoted.
--
-- They are deleted, not deactivated, because "a car with no mapping, no years and no
-- order can never answer anything" is true today and the row is only a trap for
-- somebody adding a range to the wrong one.
--
-- GUARDED, because the one thing that would make this irreversible is an order or a
-- measured floor pan pointing at one of them, and neither is true today but neither is
-- guaranteed next time this runs.
DO $$
DECLARE blocked TEXT;
BEGIN
  SELECT string_agg(m.name || ' ' || v.model || ' (' || why || ')', ', ') INTO blocked
  FROM "Vehicle" v
  JOIN "Make" m ON m.id = v."makeId"
  JOIN LATERAL (
    SELECT string_agg(src, ', ') AS why
    FROM (
      SELECT 'an order' AS src WHERE EXISTS (SELECT 1 FROM "OrderItem" o WHERE o."vehicleId" = v.id)
      UNION ALL
      SELECT 'a measured floor pan' WHERE EXISTS (SELECT 1 FROM "Mapping" mp WHERE mp."vehicleId" = v.id)
      UNION ALL
      SELECT 'a photograph' WHERE EXISTS (SELECT 1 FROM "ImageSet" im WHERE im."vehicleId" = v.id)
    ) present
  ) refs ON true
  WHERE v."yearFrom" IS NULL;

  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'These span-less rows carry something and cannot be deleted: %. Merge them into the row that holds the measured floor pan, then re-run.', blocked;
  END IF;
END $$;

DELETE FROM "Vehicle" v
WHERE v."yearFrom" IS NULL;

-- ─── 4. The audit trail ────────────────────────────────────────────────────────
-- Every row this migration touched, so "where did this car's years come from" is
-- answerable from the database rather than from a git checkout of a data file.
INSERT INTO "AuditEntry" (id, entity, "entityId", action, field, before, after, note, "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  'Vehicle', v.id, 'update', 'yearFrom',
  json_build_object('yearFrom', NULL, 'yearTo', NULL)::jsonb,
  json_build_object('yearFrom', v."yearFrom", 'yearTo', v."yearTo")::jsonb,
  'production years recorded so a year outside this span can be refused',
  now()
FROM "Vehicle" v
WHERE v."yearFrom" IS NOT NULL;

-- ─── 5. What is left to do by hand ─────────────────────────────────────────────
-- Stated by the migration rather than assumed: after this, every car answers within
-- its own production years, and `fitment-live.ts`'s null-span rule has nothing left
-- to apply to. Cars whose floor pan has never been MEASURED still answer on `active`,
-- which is a separate decision and already recorded.
DO $$
DECLARE summary TEXT;
BEGIN
  SELECT format(
    '%s vehicles now carry production years; %s of them closed before 2026, so a year past the end is refused rather than confirmed.',
    count(*),
    count(*) FILTER (WHERE "yearTo" < 2026)
  ) INTO summary
  FROM "Vehicle";
  RAISE NOTICE '%', summary;
END $$;
