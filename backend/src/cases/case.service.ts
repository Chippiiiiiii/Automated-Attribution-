import type { CaseStatus } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { recordAudit } from '../services/audit.service.js';
import { HttpError } from '../middleware/errors.js';

export function formatCaseNumber(seq: number, year: number) {
  return `CASE-${year}-${String(seq).padStart(5, '0')}`;
}

export async function createCase(input: { title: string; summary?: string; createdById: string }) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.case.create({ data: input });
    const updated = await tx.case.update({
      where: { id: created.id },
      data: { caseNumber: formatCaseNumber(created.seq, created.createdAt.getFullYear()) },
    });
    await recordAudit(
      { action: 'CASE_CREATED', userId: input.createdById, caseId: created.id, target: updated.caseNumber ?? undefined },
      tx,
    );
    return updated;
  });
}

export function listCases() {
  return prisma.case.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { wallets: true } } } });
}

export async function getCase(id: string) {
  const found = await prisma.case.findUnique({
    where: { id },
    include: { wallets: { include: { wallet: true } }, notes: { orderBy: { createdAt: 'desc' } } },
  });
  if (!found) throw new HttpError(404, 'Case not found');
  return found;
}

export async function addNote(input: { caseId: string; authorId: string; body: string }) {
  await getCase(input.caseId);
  return prisma.$transaction(async (tx) => {
    const note = await tx.caseNote.create({ data: input });
    await recordAudit({ action: 'NOTE_ADDED', userId: input.authorId, caseId: input.caseId, target: note.id }, tx);
    return note;
  });
}

export async function setStatus(caseId: string, status: CaseStatus, userId: string) {
  const current = await getCase(caseId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.case.update({ where: { id: caseId }, data: { status } });
    await recordAudit({ action: 'CASE_STATUS_CHANGED', userId, caseId, metadata: { from: current.status, to: status } }, tx);
    return updated;
  });
}

export async function listCaseAudit(caseId: string) {
  await getCase(caseId);
  const rows = await prisma.auditLog.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { name: true, email: true } } } });
  return rows.map((r) => ({ id: r.id, action: r.action, target: r.target, metadata: r.metadata, createdAt: r.createdAt, user: r.user?.name ?? r.user?.email ?? null }));
}

export async function dashboardSummary() {
  const [byStatus, wallets, latestAttributions, riskLevels] = await Promise.all([
    prisma.case.groupBy({ by: ['status'], _count: true }),
    prisma.wallet.count(),
    prisma.attributionResult.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { case: true, wallet: true, nearestVasp: { include: { entity: true } } } }),
    prisma.riskScore.groupBy({ by: ['level'], _count: true }),
  ]);
  return {
    casesByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    wallets,
    riskLevels: Object.fromEntries(riskLevels.map((r) => [r.level, r._count])),
    latestAttributions: latestAttributions.map((a) => ({
      id: a.id, caseId: a.caseId, caseNumber: a.case.caseNumber, createdAt: a.createdAt, wallet: `${a.wallet.chain}:${a.wallet.address}`,
      vasp: a.nearestVasp?.entity.name ?? null, confidence: a.confidence, classification: a.classification,
    })),
  };
}
