-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AppraisalCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AppraisalStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppraisalRelationType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE');

-- CreateEnum
CREATE TYPE "AppraisalReviewStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_cycles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AppraisalCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'PENDING',
    "overallRating" DECIMAL(3,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_reviewers" (
    "id" TEXT NOT NULL,
    "appraisalId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "relationType" "AppraisalRelationType" NOT NULL,
    "status" "AppraisalReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rating" INTEGER,
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appraisal_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_employeeNumber_key" ON "employees"("organizationId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "appraisals_cycleId_employeeId_key" ON "appraisals"("cycleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "appraisal_reviewers_appraisalId_reviewerId_key" ON "appraisal_reviewers"("appraisalId", "reviewerId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_cycles" ADD CONSTRAINT "appraisal_cycles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_reviewers" ADD CONSTRAINT "appraisal_reviewers_appraisalId_fkey" FOREIGN KEY ("appraisalId") REFERENCES "appraisals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_reviewers" ADD CONSTRAINT "appraisal_reviewers_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
