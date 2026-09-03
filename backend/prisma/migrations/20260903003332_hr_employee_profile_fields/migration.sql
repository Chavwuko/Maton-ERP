-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACT', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "EmployeeGrade" AS ENUM ('ENTRY', 'JUNIOR', 'SENIOR', 'MANAGEMENT');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "grade" "EmployeeGrade";
