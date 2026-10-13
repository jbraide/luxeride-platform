-- A zone can be WITHDRAWN without being deleted.
--
-- Why this is needed at all: `Order.locationId` is a restricted foreign key, so a zone
-- that has ever carried an order can never be deleted without stranding that order. That
-- left the owner with two bad choices for a zone he no longer wanted to sell into —
-- keep quoting it at checkout, or lose the record — and the answer he wanted was neither.
--
-- So withdrawal becomes a column. A withdrawn row keeps its orders and its history and
-- simply leaves the checkout, the delivery policy and the fee band. `DEFAULT true` makes
-- the migration a no-op for the rows that already exist: everything currently on the menu
-- stays on the menu.
ALTER TABLE "Location" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Every read that builds a customer-facing figure filters on `active`, so it earns an index.
CREATE INDEX "Location_active_idx" ON "Location"("active");
