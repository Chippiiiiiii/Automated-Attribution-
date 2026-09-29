-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'INVESTIGATOR');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'ANALYZING', 'REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('SUSPECT_WALLET', 'UNKNOWN_WALLET', 'EXCHANGE', 'VASP', 'CUSTODIAL_WALLET', 'DEPOSIT_ADDRESS', 'HOT_WALLET', 'MIXER', 'TUMBLER', 'DEFI_PROTOCOL', 'BRIDGE', 'CROSS_CHAIN_SERVICE', 'MINER', 'OTC_SERVICE', 'UNKNOWN_SERVICE');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "AttributionClass" AS ENUM ('CONFIRMED', 'STRONGLY_INFERRED', 'PROBABLE', 'POSSIBLE', 'LOW_CONFIDENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'INVESTIGATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigators" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agency" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,

    CONSTRAINT "investigators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_networks" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeSymbol" TEXT NOT NULL,
    "explorerUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "blockchain_networks_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "caseNumber" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_wallets" (
    "caseId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "role" "EntityType" NOT NULL DEFAULT 'SUSPECT_WALLET',
    "note" TEXT NOT NULL DEFAULT '',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_wallets_pkey" PRIMARY KEY ("caseId","walletId")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "chain" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "transferIndex" INTEGER NOT NULL DEFAULT 0,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "token" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'SUCCESS',
    "chainDetails" JSONB,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_edges" (
    "id" UUID NOT NULL,
    "chain" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "totalAmount" DECIMAL(38,18) NOT NULL,
    "txCount" INTEGER NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vasps" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "aliases" TEXT[],
    "jurisdiction" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "vasps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vasp_addresses" (
    "id" UUID NOT NULL,
    "vaspId" UUID NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressType" "EntityType" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "lastVerified" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "vasp_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_labels" (
    "id" UUID NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "addressType" "EntityType" NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "lastVerified" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_results" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "nearestVaspId" UUID,
    "confidence" INTEGER NOT NULL,
    "classification" "AttributionClass" NOT NULL,
    "distance" INTEGER,
    "evidence" JSONB NOT NULL,
    "transactionPath" JSONB NOT NULL,
    "intermediaryAddresses" TEXT[],
    "parameters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_scores" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "indicators" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_reports" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "generatedById" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "caseId" UUID,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "investigators_userId_key" ON "investigators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "investigators_badgeNumber_key" ON "investigators"("badgeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cases_seq_key" ON "cases"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "case_notes_caseId_idx" ON "case_notes"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_chain_address_key" ON "wallets"("chain", "address");

-- CreateIndex
CREATE INDEX "transactions_chain_fromAddress_timestamp_idx" ON "transactions"("chain", "fromAddress", "timestamp");

-- CreateIndex
CREATE INDEX "transactions_chain_toAddress_timestamp_idx" ON "transactions"("chain", "toAddress", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_chain_txHash_transferIndex_key" ON "transactions"("chain", "txHash", "transferIndex");

-- CreateIndex
CREATE INDEX "transaction_edges_chain_fromAddress_idx" ON "transaction_edges"("chain", "fromAddress");

-- CreateIndex
CREATE INDEX "transaction_edges_chain_toAddress_idx" ON "transaction_edges"("chain", "toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_edges_chain_fromAddress_toAddress_token_key" ON "transaction_edges"("chain", "fromAddress", "toAddress", "token");

-- CreateIndex
CREATE UNIQUE INDEX "entities_name_key" ON "entities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vasps_entityId_key" ON "vasps"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "vasp_addresses_chain_address_key" ON "vasp_addresses"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "address_labels_chain_address_key" ON "address_labels"("chain", "address");

-- CreateIndex
CREATE INDEX "attribution_results_caseId_idx" ON "attribution_results"("caseId");

-- CreateIndex
CREATE INDEX "risk_scores_caseId_idx" ON "risk_scores"("caseId");

-- CreateIndex
CREATE INDEX "investigation_reports_caseId_idx" ON "investigation_reports"("caseId");

-- CreateIndex
CREATE INDEX "audit_logs_caseId_createdAt_idx" ON "audit_logs"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "investigators" ADD CONSTRAINT "investigators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_chain_fkey" FOREIGN KEY ("chain") REFERENCES "blockchain_networks"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_wallets" ADD CONSTRAINT "case_wallets_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_wallets" ADD CONSTRAINT "case_wallets_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_chain_fkey" FOREIGN KEY ("chain") REFERENCES "blockchain_networks"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_edges" ADD CONSTRAINT "transaction_edges_chain_fkey" FOREIGN KEY ("chain") REFERENCES "blockchain_networks"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasps" ADD CONSTRAINT "vasps_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasp_addresses" ADD CONSTRAINT "vasp_addresses_vaspId_fkey" FOREIGN KEY ("vaspId") REFERENCES "vasps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasp_addresses" ADD CONSTRAINT "vasp_addresses_chain_fkey" FOREIGN KEY ("chain") REFERENCES "blockchain_networks"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_labels" ADD CONSTRAINT "address_labels_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_labels" ADD CONSTRAINT "address_labels_chain_fkey" FOREIGN KEY ("chain") REFERENCES "blockchain_networks"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_nearestVaspId_fkey" FOREIGN KEY ("nearestVaspId") REFERENCES "vasps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_reports" ADD CONSTRAINT "investigation_reports_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
