-- CreateTable
CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "evidence" TEXT,
    "evidenceNote" TEXT,
    "confirmationNote" TEXT,
    "confirmedOn" TIMESTAMP(3),
    "leadTime" TEXT,
    "bodyType" TEXT,
    "driveSide" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'footwell',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutVariant" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priceFrom" INTEGER NOT NULL,
    "rowsSurcharge" INTEGER,
    "stockState" TEXT NOT NULL DEFAULT 'made_to_order',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'inferred',
    "evidenceNote" TEXT,
    "confirmedBy" TEXT,
    "confirmedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageSet" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exclusion" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER NOT NULL,
    "trim" TEXT,
    "layoutId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandLog" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "phone" TEXT,
    "liveLayoutsAtThisTime" INTEGER NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "who" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Layout_internalCode_idx" ON "Layout"("internalCode");

-- CreateIndex
CREATE INDEX "Layout_makeId_status_idx" ON "Layout"("makeId", "status");

-- CreateIndex
CREATE INDEX "Layout_status_idx" ON "Layout"("status");

-- CreateIndex
CREATE INDEX "LayoutVariant_productId_idx" ON "LayoutVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LayoutVariant_layoutId_productId_kind_key" ON "LayoutVariant"("layoutId", "productId", "kind");

-- CreateIndex
CREATE INDEX "Mapping_vehicleId_idx" ON "Mapping"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Mapping_layoutId_vehicleId_key" ON "Mapping"("layoutId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageSet_layoutId_angle_key" ON "ImageSet"("layoutId", "angle");

-- CreateIndex
CREATE INDEX "Exclusion_make_model_idx" ON "Exclusion"("make", "model");

-- CreateIndex
CREATE INDEX "Exclusion_layoutId_idx" ON "Exclusion"("layoutId");

-- CreateIndex
CREATE INDEX "DemandLog_make_model_idx" ON "DemandLog"("make", "model");

-- CreateIndex
CREATE INDEX "DemandLog_createdAt_idx" ON "DemandLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_entity_entityId_idx" ON "AuditEntry"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditEntry_createdAt_idx" ON "AuditEntry"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_layoutId_idx" ON "OrderItem"("layoutId");

-- CreateIndex
CREATE INDEX "OrderItem_layoutVariantId_idx" ON "OrderItem"("layoutVariantId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_layoutVariantId_fkey" FOREIGN KEY ("layoutVariantId") REFERENCES "LayoutVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutVariant" ADD CONSTRAINT "LayoutVariant_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutVariant" ADD CONSTRAINT "LayoutVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageSet" ADD CONSTRAINT "ImageSet_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exclusion" ADD CONSTRAINT "Exclusion_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

