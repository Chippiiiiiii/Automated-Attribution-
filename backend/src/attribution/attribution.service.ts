import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { isSupportedChain } from '../blockchain/registry.js';
import { normalizeAddress } from '../blockchain/address.js';
import type { EngineDeps } from './engine.js';
import { attributeAcrossChains } from '../crosschain/cross-chain.js';
import { loadAttributionConfig } from './config.js';
import type { AttributionResult } from './types.js';

export interface AnalyzeInput {
  caseId: string;
  walletId: string;
  userId: string;
  maxHops: number;
  from?: Date;
  to?: Date;
}

/** Runs attribution for a case wallet, stores the result and moves the case to REVIEW. */
export async function analyzeWallet(input: AnalyzeInput, deps: EngineDeps = {}) {
  const { caseId, walletId, userId } = input;
  const link = await prisma.caseWallet.findUnique({ where: { caseId_walletId: { caseId, walletId } }, include: { wallet: true } });
  if (!link) throw new HttpError(404, 'Wallet is not part of this case');
  const { wallet } = link;
  if (!isSupportedChain(wallet.chain)) throw new HttpError(400, `Unsupported chain ${wallet.chain}`);

  await prisma.case.update({ where: { id: caseId }, data: { status: 'ANALYZING' } });
  await recordAudit({ action: 'ANALYSIS_STARTED', userId, caseId, target: wallet.address, metadata: { chain: wallet.chain, maxHops: input.maxHops } });

  let result: AttributionResult;
  try {
    result = await attributeAcrossChains(
      {
        chain: wallet.chain,
        walletAddress: wallet.address,
        maxHops: input.maxHops,
        timeRange: { ...(input.from && { from: input.from }), ...(input.to && { to: input.to }) },
      },
      { ...deps, config: deps.config ?? (await loadAttributionConfig()) },
    );
  } catch (err) {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'OPEN' } });
    throw err;
  }

  const stored = await prisma.$transaction(async (tx) => {
    const row = await tx.attributionResult.create({
      data: {
        caseId,
        walletId,
        nearestVaspId: result.nearestVasp?.vasp.vaspId ?? null,
        confidence: result.confidence,
        classification: result.classification,
        distance: result.distance,
        evidence: result as unknown as Prisma.InputJsonValue,
        transactionPath: result.transactionPath as unknown as Prisma.InputJsonValue,
        intermediaryAddresses: result.intermediaryAddresses,
        parameters: result.parameters as unknown as Prisma.InputJsonValue,
      },
    });
    // Aggregated flows along the selected path, so later stages can reuse them without re-querying providers.
    // Bridge hops span two chains, so they are recorded in the result but not as a single-chain edge.
    for (const h of result.transactionPath.filter((x) => !x.bridgeId)) {
      const key = { chain: h.chain ?? wallet.chain, fromAddress: h.from, toAddress: h.to, token: h.token };
      await tx.transactionEdge.upsert({
        where: { chain_fromAddress_toAddress_token: key },
        create: { ...key, totalAmount: h.amount, txCount: h.txCount, firstSeen: h.firstTimestamp, lastSeen: h.lastTimestamp },
        update: { totalAmount: h.amount, txCount: h.txCount, firstSeen: h.firstTimestamp, lastSeen: h.lastTimestamp },
      });
    }
    await tx.case.update({ where: { id: caseId }, data: { status: 'REVIEW' } });
    await recordAudit({ action: 'ANALYSIS_COMPLETED', userId, caseId, target: wallet.address, metadata: { candidates: result.candidates.length, graph: result.graph } }, tx);
    await recordAudit(
      {
        action: 'ATTRIBUTION_GENERATED',
        userId,
        caseId,
        target: wallet.address,
        metadata: { attributionId: row.id, vasp: result.nearestVasp?.vasp.name ?? null, confidence: result.confidence, classification: result.classification },
      },
      tx,
    );
    return row;
  });

  return { id: stored.id, createdAt: stored.createdAt, ...result };
}

export async function listAttributions(caseId: string) {
  const rows = await prisma.attributionResult.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
    include: { wallet: true, nearestVasp: { include: { entity: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    wallet: { chain: r.wallet.chain, address: r.wallet.address },
    nearestVasp: r.nearestVasp ? { name: r.nearestVasp.entity.name, isDemo: r.nearestVasp.entity.isDemo } : null,
    confidence: r.confidence,
    classification: r.classification,
    distance: r.distance,
    detail: r.evidence,
  }));
}

export async function addCaseWallet(input: { caseId: string; chain: string; address: string; userId: string; note?: string }) {
  if (!isSupportedChain(input.chain)) throw new HttpError(400, `Unsupported chain ${input.chain}`);
  const address = normalizeAddress(input.chain, input.address);
  const caseRow = await prisma.case.findUnique({ where: { id: input.caseId } });
  if (!caseRow) throw new HttpError(404, 'Case not found');
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { chain_address: { chain: input.chain, address } },
      create: { chain: input.chain, address },
      update: {},
    });
    const link = await tx.caseWallet.upsert({
      where: { caseId_walletId: { caseId: input.caseId, walletId: wallet.id } },
      create: { caseId: input.caseId, walletId: wallet.id, note: input.note ?? '' },
      update: {},
    });
    await recordAudit({ action: 'WALLET_ADDED', userId: input.userId, caseId: input.caseId, target: `${input.chain}:${address}` }, tx);
    return { ...link, wallet };
  });
}
