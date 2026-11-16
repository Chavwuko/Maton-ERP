-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('NONE', 'STRAIGHT_LINE', 'DECLINING_BALANCE');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "depreciationStartDate" DATE,
ADD COLUMN     "salvageValue" DECIMAL(18,2),
ADD COLUMN     "usefulLifeMonths" INTEGER;

