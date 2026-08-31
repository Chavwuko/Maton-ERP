-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('INJURY', 'NEAR_MISS', 'ENVIRONMENTAL', 'PROPERTY_DAMAGE', 'SECURITY');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "incidentId" TEXT;

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_idx" ON "incidents"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
