-- Per-range photographs.
--
-- A photograph now belongs to a (layout, vehicle) RANGE rather than to a layout
-- alone, so a car carrying several year ranges can show different shots for each.
-- Generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- rather than `migrate dev`, whose shadow-database replay of
-- `20261003125200_add_fitment_tables` fails on a pre-existing index. ImageSet is
-- empty (every seeded layout has `images: []`), so the NOT NULL column is additive.

-- DropIndex
DROP INDEX "ImageSet_layoutId_angle_key";

-- AlterTable
ALTER TABLE "ImageSet" ADD COLUMN     "vehicleId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ImageSet_vehicleId_idx" ON "ImageSet"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageSet_layoutId_vehicleId_angle_key" ON "ImageSet"("layoutId", "vehicleId", "angle");

-- AddForeignKey
ALTER TABLE "ImageSet" ADD CONSTRAINT "ImageSet_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
