-- Move the PDP and category-page copy out of `src/data/products.ts` and into the
-- database.
--
-- WHY THIS MIGRATION EXISTS AT ALL
--
-- The owner's decision was that the DATABASE is the catalogue authority, so a product
-- or category can be created in the admin and reach the shop. That promise was only
-- half-kept while the words on the pages lived in a source file: a new product would
-- have appeared with a name, a price and no description, because the description had
-- nowhere to be written down. Adding these columns is what makes the admin the whole
-- answer rather than half of it.
--
-- NOTHING IS BACKFILLED BY THIS FILE.
--
-- The copy already exists, it is just typed. `src/data/products.ts` holds every one
-- of these strings today and `prisma/seed.mts` already imports them, so the move is
-- carried out by the seed rather than by 400 lines of generated UPDATE — which would
-- be a second copy of the same prose to keep in step forever.
--
-- Applied through the documented shadow-free path (`db execute` + `migrate resolve`),
-- because the `luxeride` role has no CREATEDB. See master-build-plan M6.2.
--
-- EVERY COLUMN IS ADDITIVE AND NULLABLE. A new product or category created in the
-- admin after this migration has all of them null, which is a real state the
-- storefront renders honestly rather than filling in a placeholder sentence.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "heroLine" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "care" TEXT,
ADD COLUMN     "coverage" TEXT,
ADD COLUMN     "faq" JSONB,
ADD COLUMN     "inBox" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "install" TEXT,
ADD COLUMN     "materials" TEXT,
ADD COLUMN     "seoDescription" TEXT;