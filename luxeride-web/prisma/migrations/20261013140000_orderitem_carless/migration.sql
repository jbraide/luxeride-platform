-- An order line can have NO CAR.
--
-- A shop-only product (`Product.isCarSpecific: false` — a seat cover, mud flaps, a sun
-- shade) is bought without a make, model or year. Until now every `OrderItem` had to carry
-- one, so those products could not be cart lines at all: their PDP had nowhere to send the
-- customer but WhatsApp, and a customer could not buy a seat cover together with a set of
-- mats.
--
-- Widening three NOT NULL columns to nullable, so it is a no-op for every existing row:
-- a line that already names a car keeps it, and the readers omit the car only when all
-- three are null.
ALTER TABLE "OrderItem" ALTER COLUMN "brandSnapshot" DROP NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "modelSnapshot" DROP NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "yearSnapshot" DROP NOT NULL;
