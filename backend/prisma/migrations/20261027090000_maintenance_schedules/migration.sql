-- CreateEnum
CREATE TYPE "ScheduleIntervalUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "ScheduleBasis" AS ENUM ('FIXED', 'FLOATING');

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "completionNotes" TEXT,
ADD COLUMN     "cost" DECIMAL(18,2),
ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "intervalValue" INTEGER NOT NULL,
    "intervalUnit" "ScheduleIntervalUnit" NOT NULL,
    "basis" "ScheduleBasis" NOT NULL DEFAULT 'FIXED',
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "nextDueDate" DATE NOT NULL,
    "lastCompletedDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_schedules_active_nextDueDate_idx" ON "maintenance_schedules"("active", "nextDueDate");

-- CreateIndex
CREATE INDEX "maintenance_schedules_assetId_idx" ON "maintenance_schedules"("assetId");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A schedule has at most one open work order at a time, so generating the next
-- one is safe to repeat (and safe if two servers run it at once).
CREATE UNIQUE INDEX "work_orders_one_open_per_schedule" ON "work_orders" ("scheduleId") WHERE "scheduleId" IS NOT NULL AND "status" IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD');
