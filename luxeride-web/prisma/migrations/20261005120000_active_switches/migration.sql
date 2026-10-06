-- The sell switches: one boolean per car, one per YEAR RANGE.
--
-- Owner's decision, 2026-10-05: assume every car is supplyable and deactivate the ones that are not.
-- Until now the gate was Layout.status = 'confirmed', and 212 seeded cars sat at 'inferred'
-- and therefore refused \u2014 so the shop could sell two cars out of two hundred and twelve.
--
-- DEFAULT TRUE on both columns. That is the decision, not an oversight: the owner supplies
-- the floor pans and knows the stock, and a switch they can flip is a more honest control than
-- a ceremony they have to complete per car.
--
-- Nothing is deleted and nothing is rewritten. 'inferred' keeps meaning 'nobody filed a
-- written confirmation', which is still true and still worth recording.
--
-- Applied through the shadow-free path (db execute + migrate resolve).

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Layout" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Layout_active_idx" ON "Layout"("active");

