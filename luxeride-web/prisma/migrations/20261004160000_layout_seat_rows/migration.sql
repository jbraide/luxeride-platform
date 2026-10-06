-- Let the owner say how many rows of seats a car has.
--
-- Added 2026-10-04. The Fit Finder has always asked "2 rows or 3 rows?" and charged a
-- 3-row surcharge on the answer. That is right for a car sold in both — a Toyota
-- Highlander genuinely is a 2-row and a 3-row — and wrong for one that is only ever
-- three rows, where the question is something we already know and the customer can
-- answer wrong.
--
-- `DEFAULT 'mixed'` is the honest starting state and the only value that is true
-- before anybody has checked a car: "mixed" means "ask". Nothing is inferred from the
-- model name. `src/data/cars.ts` carries no seating data at all, and guessing "GX 460
-- is a 3-row" from the string would be an assertion with nothing behind it.
--
-- One column, one statement, no data moved. Applied through the documented shadow-free
-- path (`db execute` + `migrate resolve`) because the `luxeride` role has no CREATEDB.

-- AlterTable
ALTER TABLE "Layout" ADD COLUMN     "seatRows" TEXT NOT NULL DEFAULT 'mixed';
