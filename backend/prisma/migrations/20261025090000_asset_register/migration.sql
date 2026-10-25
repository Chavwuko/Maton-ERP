-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "make" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "purchaseCost" DECIMAL(18,2),
ADD COLUMN     "purchaseDate" DATE,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "vendorId" TEXT,
ADD COLUMN     "warrantyExpiry" DATE;

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "departmentId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturn" DATE,
    "returnedAt" TIMESTAMP(3),
    "conditionOut" "AssetCondition" NOT NULL,
    "conditionIn" "AssetCondition",
    "notes" TEXT,
    "returnNotes" TEXT,
    "assignedById" TEXT NOT NULL,
    "returnedById" TEXT,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_assignments_assetId_returnedAt_idx" ON "asset_assignments"("assetId", "returnedAt");

-- CreateIndex
CREATE INDEX "asset_assignments_assigneeId_idx" ON "asset_assignments"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_serialNumber_key" ON "assets"("organizationId", "serialNumber");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An asset can be held by only one person or department at a time: at most one
-- open (not yet returned) assignment per asset. Prisma cannot express a partial
-- unique index, so it lives here.
CREATE UNIQUE INDEX "asset_assignments_one_open_per_asset" ON "asset_assignments" ("assetId") WHERE "returnedAt" IS NULL;
