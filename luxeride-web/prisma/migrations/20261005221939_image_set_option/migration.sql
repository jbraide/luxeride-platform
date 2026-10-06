-- Photos belong to an OPTION, not just to a year range.
--
-- Owner's words, 2026-10-05: "each year range should have the option for pics for
-- single and double, not one or the other". A single-layer set and a double-layer set
-- cut for the same car are different objects that look different, so a gallery with one
-- slot per (range, angle) could only ever photograph ONE of them — and whichever was
-- missing is exactly the one a customer needs to see before paying the difference.
--
-- So `variationId` becomes part of the unique key: every option of every range gets its
-- own slots, and two options of one range can each carry a `driver` shot.
--
-- THE COLUMN IS ADDED NULLABLE, GUARDED, THEN TIGHTENED. Not in one statement, because
-- `ADD COLUMN NOT NULL` with no default only succeeds on an empty table — and this
-- database is not the only one this file will ever run against. The guard REFUSES if any
-- photograph already exists, rather than inventing an option for it: a photo attached
-- to a guessed option is evidence attached to the wrong claim, which is the one thing
-- this table must never hold.
--
-- The old unique key is dropped only after the column is in place, so there is no window
-- in which the same (range, angle) could be written twice.
--
-- Applied through the shadow-free path (db execute + migrate resolve).

-- AlterTable
ALTER TABLE "ImageSet" ADD COLUMN "variationId" TEXT;

-- Refuse rather than guess. There is no honest default option: the photograph is
-- evidence for a claim, and attaching it to an option nobody chose attaches the
-- evidence to the wrong claim.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ImageSet") THEN
    RAISE EXCEPTION
      'ImageSet has % row(s) and no option to attach them to. Re-attach each photograph to the option it shows, then re-run this migration.', (SELECT COUNT(*) FROM "ImageSet");
  END IF;
END $$;

ALTER TABLE "ImageSet" ALTER COLUMN "variationId" SET NOT NULL;

-- AlterTable: the foreign key, `Cascade` like the range and the pan it belongs to.
ALTER TABLE "ImageSet" ADD CONSTRAINT "ImageSet_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "ImageSet_layoutId_vehicleId_angle_key";

-- CreateIndex: one slot per angle, per range, per option.
CREATE UNIQUE INDEX "ImageSet_layoutId_vehicleId_variationId_angle_key" ON "ImageSet"("layoutId", "vehicleId", "variationId", "angle");

-- CreateIndex
CREATE INDEX "ImageSet_variationId_idx" ON "ImageSet"("variationId");