import type { Prisma, SahyogKind } from '../generated/prisma/client.js';
import type { AttributionResult } from '../attribution/types.js';
import { listAttributions } from '../attribution/attribution.service.js';
import { getCase } from '../cases/case.service.js';
import { prisma } from '../database/client.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { MOCK_NOTICE, mockSubmit, nextMockStatus } from './mock-client.js';

const INFERENCE_NOTICE = 'The attribution below is an analytical inference and does not by itself establish beneficial ownership. Corroboration is required.';

async function latestAttribution(caseId: string, walletId: string) {
  const c = await getCase(caseId);
  const cw = c.wallets.find((w) => w.walletId === walletId);
  if (!cw) throw new HttpError(400, 'Wallet is not part of this case');
  const a = (await listAttributions(caseId)).find((x) => x.wallet.chain === cw.wallet.chain && x.wallet.address === cw.wallet.address);
  return { c, wallet: cw.wallet, result: a ? (a.detail as unknown as AttributionResult) : null };
}

async function buildPayload(caseId: string, kind: SahyogKind, walletId?: string): Promise<Prisma.InputJsonObject> {
  if (kind === 'SYNC') {
    const c = await getCase(caseId);
    const attrs = await listAttributions(caseId);
    return {
      case: { caseNumber: c.caseNumber, title: c.title, status: c.status, summary: c.summary },
      wallets: c.wallets.map((w) => ({ chain: w.wallet.chain, address: w.wallet.address })),
      findings: attrs.slice(0, 20).map((a) => ({ wallet: a.wallet, nearestVasp: a.nearestVasp?.name ?? null, classification: a.classification, confidence: a.confidence })),
      notice: INFERENCE_NOTICE,
    };
  }
  if (!walletId) throw new HttpError(400, 'walletId is required for disclosure and freeze requests');
  const { c, wallet, result } = await latestAttribution(caseId, walletId);
  if (!result?.nearestVasp) throw new HttpError(422, 'No attributed VASP for this wallet. Run an attribution that identifies a VASP first.');
  const v = result.nearestVasp;
  const vasp = await prisma.vasp.findUnique({ where: { id: v.vasp.vaspId }, include: { entity: true } });
  const trail = result.transactionPath.map((h) => ({ chain: h.chain ?? wallet.chain, from: h.from, to: h.to, token: h.token, amount: h.amount, txHashes: h.txHashes, firstSeen: h.firstTimestamp }));
  const base = {
    case: { caseNumber: c.caseNumber, title: c.title },
    target: { vaspId: v.vasp.vaspId, name: v.vasp.name, jurisdiction: vasp?.jurisdiction ?? null, isDemo: v.vasp.isDemo, terminalAddress: v.terminalAddress },
    suspectWallet: { chain: wallet.chain, address: wallet.address },
    attribution: { classification: result.classification, confidence: result.confidence, distance: result.distance, reasoning: result.reasoning },
    transactionTrail: trail,
    notice: INFERENCE_NOTICE,
  };
  if (kind === 'DISCLOSURE') {
    return { ...base, request: { type: 'KYC / account-holder disclosure', addressesOfInterest: [v.terminalAddress, wallet.address], period: { from: trail[0]?.firstSeen ?? null } } };
  }
  return { ...base, request: { type: 'Temporary freeze of funds', addressesToFreeze: [v.terminalAddress], asset: { token: v.token, observedAmount: v.amount }, caution: 'Freeze scope must be confirmed against legal authority before submission.' } };
}

export async function prepareRequest(input: { caseId: string; kind: SahyogKind; walletId?: string; userId: string }) {
  const payload = await buildPayload(input.caseId, input.kind, input.walletId);
  return prisma.$transaction(async (tx) => {
    const row = await tx.sahyogRequest.create({
      data: { caseId: input.caseId, kind: input.kind, payload, preparedById: input.userId, history: [{ status: 'PREPARED', at: new Date().toISOString() }] },
    });
    await recordAudit({ action: 'SAHYOG_PREPARED', userId: input.userId, caseId: input.caseId, target: row.id, metadata: { kind: input.kind } }, tx);
    return row;
  });
}

async function load(caseId: string, id: string) {
  const row = await prisma.sahyogRequest.findFirst({ where: { id, caseId } });
  if (!row) throw new HttpError(404, 'SAHYOG request not found');
  return row;
}
const withHistory = (row: { history: unknown }, status: string) => [...(row.history as object[]), { status, at: new Date().toISOString() }];

export async function submitRequest(input: { caseId: string; id: string; legalReference: string; userId: string }) {
  const row = await load(input.caseId, input.id);
  if (row.status !== 'PREPARED') throw new HttpError(409, `Request already ${row.status}`);
  const { reference } = mockSubmit();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sahyogRequest.update({
      where: { id: row.id },
      data: { status: 'SUBMITTED', legalReference: input.legalReference, mockReference: reference, submittedById: input.userId, submittedAt: new Date(), history: withHistory(row, 'SUBMITTED') },
    });
    await recordAudit({ action: 'SAHYOG_SUBMITTED_MOCK', userId: input.userId, caseId: input.caseId, target: row.id, metadata: { kind: row.kind, reference, mock: true } }, tx);
    return updated;
  });
}

/** Simulates the next response in the mock lifecycle. */
export async function advanceRequest(input: { caseId: string; id: string; userId: string }) {
  const row = await load(input.caseId, input.id);
  if (row.status === 'PREPARED') throw new HttpError(409, 'Request has not been submitted');
  const next = nextMockStatus(row.status);
  if (!next) throw new HttpError(409, 'Request is already in its final state');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sahyogRequest.update({ where: { id: row.id }, data: { status: next, history: withHistory(row, next) } });
    await recordAudit({ action: 'SAHYOG_STATUS_UPDATED_MOCK', userId: input.userId, caseId: input.caseId, target: row.id, metadata: { from: row.status, to: next, mock: true } }, tx);
    return updated;
  });
}

export async function listRequests(caseId: string) {
  await getCase(caseId);
  const rows = await prisma.sahyogRequest.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' } });
  return { notice: MOCK_NOTICE, requests: rows };
}
