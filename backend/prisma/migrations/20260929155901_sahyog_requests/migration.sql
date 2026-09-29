-- CreateEnum
CREATE TYPE "SahyogKind" AS ENUM ('SYNC', 'DISCLOSURE', 'FREEZE');

-- CreateEnum
CREATE TYPE "SahyogStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'FULFILLED');

-- CreateTable
CREATE TABLE "sahyog_requests" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" "SahyogKind" NOT NULL,
    "status" "SahyogStatus" NOT NULL DEFAULT 'PREPARED',
    "payload" JSONB NOT NULL,
    "legalReference" TEXT,
    "mockReference" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "preparedById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sahyog_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sahyog_requests_caseId_idx" ON "sahyog_requests"("caseId");

-- AddForeignKey
ALTER TABLE "sahyog_requests" ADD CONSTRAINT "sahyog_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
