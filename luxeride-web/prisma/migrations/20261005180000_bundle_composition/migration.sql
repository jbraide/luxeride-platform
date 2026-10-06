-- Bundles as a COMPOSITION of other products, plus a discount.
--
-- 'full-bundle' was one hand-priced product row: regular 110,000 / premium 135,000, with
-- "Double layer mats + seat covers" written in a prose note. That is a bundle with exactly
-- one possible composition \u2014 so a customer wanting SINGLE layer mats with covers had nothing
-- to buy, and a customer wanting mats plus a boot liner had nothing to buy either.
--
-- It is also why the bundle could not tie into the mats: its price was a literal, so moving
-- the double layer mats from 68,000 to 75,000 left a bundle claiming to contain them and
-- priced as though it did not. A bundle that states its parts is priced FROM them, so the
-- two cannot drift.
--
-- WHY A BUNDLE IS STILL A Product
--
-- A bundle needs a URL, a product page, a cart line, an OrderItem and a LayoutVariant.
-- Every one of those is already a Product reference, so a parallel entity would mean a
-- second version of all of them. Bundle.productId is therefore one-to-one with Product, and
-- what these tables add is the one fact a Product could not previously state.
--
-- WHY THE DISCOUNT IS NOT A Promotion
--
-- Promotion is time-boxed and customer-facing (Black Friday, a coupon). A bundle's discount
-- is permanent and belongs to the product; a bundle that needed a Promotion row would be
-- undiscounted the moment that promotion expired.
--
-- Two new tables and three relations. Nothing existing is rewritten or deleted here; the
-- derived price for the existing bundle is written by src/lib/bundle-price.ts at seed time,
-- where it can be shown to the operator rather than applied silently by a migration.
--
-- Applied through the shadow-free path (db execute + migrate resolve), the same one
-- 20261005120000_active_switches and 20261005160000_site_settings used: `migrate dev`
-- cannot replay this database's history because a pre-existing index collides in the
-- shadow database (P3006), and that is a property of the shadow, not of this SQL.

-- CreateTable
CREATE TABLE "Bundle" (
    "productId" TEXT NOT NULL,
    "discountKind" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "derivePricing" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variationId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BundleItem_bundleId_productId_variationId_key" ON "BundleItem"("bundleId", "productId", "variationId");

-- CreateIndex
CREATE INDEX "BundleItem_productId_idx" ON "BundleItem"("productId");

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;