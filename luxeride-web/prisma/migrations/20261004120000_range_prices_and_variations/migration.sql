-- Per-year-range pricing, and product variations.
--
-- The DDL below is verbatim `prisma migrate diff --from-schema-datamodel
-- .scratch/schema.old.prisma --to-schema-datamodel prisma/schema.prisma --script`.
-- The backfill that follows is hand-written. Applied through the documented
-- shadow-free path (`db execute` + `migrate resolve`) because the `luxeride` role
-- has no CREATEDB and `migrate dev` cannot build a shadow database.
-- See master-build-plan M6.2.
--
-- EVERY STATEMENT HERE IS ADDITIVE. Nothing is dropped, and no existing row loses a
-- value: `LayoutVariant.priceFrom` survives as the DEFAULT a new year range starts
-- from, and is COPIED into a `RangePrice` per range rather than being replaced by it.

-- ─── DDL ────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isCarSpecific" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variationId" TEXT;

-- AlterTable
ALTER TABLE "LayoutVariant" ADD COLUMN     "variationId" TEXT;

-- CreateTable
CREATE TABLE "ProductVariation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regular" INTEGER NOT NULL,
    "premium" INTEGER NOT NULL,
    "rowApplicable" BOOLEAN NOT NULL DEFAULT false,
    "threeRowSurcharge" INTEGER,
    "sku" TEXT,
    "stockState" TEXT NOT NULL DEFAULT 'made_to_order',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RangePrice" (
    "id" TEXT NOT NULL,
    "layoutVariantId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "priceFrom" INTEGER NOT NULL,
    "rowsSurcharge" INTEGER,
    "stockState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RangePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariation_sortOrder_idx" ON "ProductVariation"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariation_productId_slug_key" ON "ProductVariation"("productId", "slug");

-- CreateIndex
CREATE INDEX "RangePrice_vehicleId_idx" ON "RangePrice"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "RangePrice_layoutVariantId_vehicleId_key" ON "RangePrice"("layoutVariantId", "vehicleId");

-- CreateIndex
CREATE INDEX "Product_isCarSpecific_idx" ON "Product"("isCarSpecific");

-- AddForeignKey
ALTER TABLE "ProductVariation" ADD CONSTRAINT "ProductVariation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutVariant" ADD CONSTRAINT "LayoutVariant_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RangePrice" ADD CONSTRAINT "RangePrice_layoutVariantId_fkey" FOREIGN KEY ("layoutVariantId") REFERENCES "LayoutVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RangePrice" ADD CONSTRAINT "RangePrice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── The backfill ───────────────────────────────────────────────────────────
--
-- Two jobs, in order. Both are what keeps the storefront answering exactly as it
-- does today while the quote path moves onto `RangePrice`.

-- (a) ONE DEFAULT VARIATION PER EXISTING PRODUCT.
--
-- The seven products had no options before this table — "Double Layer Mats" was one
-- thing at one price — so each gets exactly one variation carrying the product's own
-- price. Behaviour is identical; the capability is new. Without this, adding a second
-- variation to a product would have nowhere to live.
--
-- The id is `'var-' || slug`, a deterministic string rather than a generated uuid, so
-- step (c) can join on it in plain SQL and a re-run is idempotent. String ids match the
-- existing convention in this schema (`Layout.id` is `layout-toyota-matrix`).
INSERT INTO "ProductVariation"
  ("id", "productId", "slug", "name", "regular", "premium", "rowApplicable",
   "threeRowSurcharge", "sku", "stockState", "sortOrder", "createdAt", "updatedAt")
SELECT
  'var-' || p."slug",
  p."id",
  p."slug",
  p."name",
  p."regular",
  p."premium",
  p."rowApplicable",
  p."threeRowSurcharge",
  NULL,
  'made_to_order',
  0,
  now(), now()
FROM "Product" p
ON CONFLICT ("productId", "slug") DO NOTHING;

-- (b) A RANGE PRICE FOR EVERY (OFFER, YEAR RANGE) ALREADY ON RECORD.
--
-- This is the load-bearing insert. `checkFitLive` will quote ONLY from `RangePrice`,
-- so without this every one of the 212 cars would drop from "we can answer for it" to
-- `nothingToQuote` the moment this migration landed — a silent loss of the whole
-- catalogue, on a table that was supposed to be additive.
--
-- The price is copied from `LayoutVariant.priceFrom` unchanged, which is exactly the
-- "all in one" price this migration exists to let you replace range by range. It is a
-- starting point, not a claim: all 212 layouts are `inferred`, so no customer is
-- quoted any of it until a layout is confirmed.
--
-- `stockState` is written NULL rather than copied, meaning "whatever the offer says".
-- The offer-level value is the one the owner sets deliberately; copying it into 850+
-- rows would make changing it later a sweep rather than an edit.
--
-- Note every seeded `Vehicle` has NULL yearFrom/yearTo — `cars.ts` has no year
-- dimension at all — so these rows exist but cover an unnamed span. They are what the
-- owner's real ranges get edited into.
INSERT INTO "RangePrice"
  ("id", "layoutVariantId", "vehicleId", "priceFrom", "rowsSurcharge", "stockState",
   "createdAt", "updatedAt")
SELECT
  v."id" || '::' || m."vehicleId",
  v."id",
  m."vehicleId",
  v."priceFrom",
  v."rowsSurcharge",
  NULL,
  now(), now()
FROM "LayoutVariant" v
JOIN "Mapping" m ON m."layoutId" = v."layoutId"
ON CONFLICT ("layoutVariantId", "vehicleId") DO NOTHING;

-- (c) POINT EVERY OFFER AT ITS PRODUCT'S DEFAULT VARIATION.
--
-- Null already means "the product's own option" on the read path, so this is not
-- strictly required. It is here so the admin screens show the resolved variation
-- rather than a blank the owner would have to interpret.
UPDATE "LayoutVariant" v
SET "variationId" = 'var-' || p."slug"
FROM "Product" p
WHERE v."productId" = p."id" AND v."variationId" IS NULL;