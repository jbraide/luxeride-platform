-- Archive: a nullable timestamp on Product and ProductVariation.
--
-- The reversible answer to a delete that has to be refused. An order line cannot be
-- undone, and a Product a floor pan still offers cannot lose its fit claim — so the
-- storefront stops showing the row while the row, its prices and its order history
-- stay exactly where they were. `archivedAt` is the switch: NULL is live, a timestamp
-- is archived, and `src/lib/catalogue.ts` filters `archivedAt: null` on every
-- storefront read (the /shop listing, the PDP, the related strip, the sitemap).
--
-- ADDITIVE and NULLABLE. Every existing row is live by default, so this changes nothing
-- about what the shop shows until the owner archives something. No index: the catalogue
-- is a handful of rows, and the admin reads are unfiltered anyway.
--
-- Hand-written and IDEMPOTENT (`ADD COLUMN IF NOT EXISTS`) because the configured
-- database is production and this file is applied by the owner, not by an agent. Apply
-- with the shadow-free path (db execute + migrate resolve) the other ADD COLUMN
-- migrations used, or with `prisma migrate deploy` once reviewed.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductVariation" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
