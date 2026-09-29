import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { isSupportedChain } from '../blockchain/registry.js';
import { assessWallet, type RiskDeps } from './engine.js';
import { loadRiskConfig } from './config.js';

export async function scoreWallet(input: { caseId: string; walletId: string; userId: string; maxHops: number }, deps: RiskDeps = {}) {
  const link = await prisma.caseWallet.findUnique({ where: { caseId_walletId: { caseId: input.caseId, walletId: input.walletId } }, include: { wallet: true } });
  if (!link) throw new HttpError(404, 'Wallet is not part of this case');
  const { wallet } = link;
  if (!isSupportedChain(wallet.chain)) throw new HttpError(400, `Unsupported chain ${wallet.chain}`);

  const report = await assessWallet(wallet.chain, wallet.address, input.maxHops, { ...deps, config: deps.config ?? (await loadRiskConfig()) });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.riskScore.create({
      data: { caseId: input.caseId, walletId: input.walletId, score: report.score, level: report.level, indicators: report as unknown as Prisma.InputJsonValue },
    });
    await recordAudit(
      { action: 'RISK_SCORED', userId: input.userId, caseId: input.caseId, target: wallet.address, metadata: { riskId: created.id, score: report.score, level: report.level } },
      tx,
    );
    return created;
  });
  return { id: row.id, createdAt: row.createdAt, ...report };
}

export async function listRiskScores(caseId: string) {
  const rows = await prisma.riskScore.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, include: { wallet: true } });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, wallet: { chain: r.wallet.chain, address: r.wallet.address }, score: r.score, level: r.level, detail: r.indicators }));
}
