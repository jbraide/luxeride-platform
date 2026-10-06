-- A key/value settings table.
--
-- The hero layout was a COOKIE, which made the admin switcher meaningless: a cookie is
-- per-visitor, so setting it from /admin would have changed the operator's own screen and
-- nobody else's. Anything an operator sets has to be server-side state or it is not a control.
--
-- The owner's words: "I didn't see the switcher for Fullwidth to Crop in the admin."
--
-- Additive, one table, no existing row touched.

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

