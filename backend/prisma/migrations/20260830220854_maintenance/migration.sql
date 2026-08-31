-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkOrderType" NOT NULL DEFAULT 'CORRECTIVE',
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_orders_organizationId_status_idx" ON "work_orders"("organizationId", "status");

-- CreateIndex
CREATE INDEX "work_orders_assetId_status_idx" ON "work_orders"("assetId", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
