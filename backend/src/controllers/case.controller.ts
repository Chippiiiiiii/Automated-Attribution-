import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth.js';
import { createCase, getCase, listCases, addNote, setStatus, listCaseAudit, dashboardSummary } from '../cases/case.service.js';
import { addCaseWallet, analyzeWallet, listAttributions } from '../attribution/attribution.service.js';
import { listRiskScores, scoreWallet } from '../risk/risk.service.js';
import { isPlausibleAddress } from '../blockchain/address.js';
import { SUPPORTED_CHAINS } from '../config/networks.js';
import { MAX_HOPS_LIMIT } from '../graph/build-graph.js';
import { generateReport, getReport, listReports } from '../reports/report.service.js';
import { renderReportPdf } from '../reports/report.pdf.js';
import { advanceRequest, listRequests, prepareRequest, submitRequest } from '../sahyog/sahyog.service.js';
import { recordAudit } from '../services/audit.service.js';

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(5000).optional(),
});

export async function create(req: Request, res: Response) {
  res.status(201).json(await createCase({ ...createSchema.parse(req.body), createdById: currentUser(req).id }));
}

export async function list(_req: Request, res: Response) {
  res.json(await listCases());
}

export async function get(req: Request, res: Response) {
  res.json(await getCase(z.uuid().parse(req.params.id)));
}

const id = (req: Request) => z.uuid().parse(req.params.id);

const walletSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS),
  address: z.string().refine(isPlausibleAddress, 'Invalid address'),
  note: z.string().trim().max(1000).optional(),
});
export async function addWallet(req: Request, res: Response) {
  res.status(201).json(await addCaseWallet({ ...walletSchema.parse(req.body), caseId: id(req), userId: currentUser(req).id }));
}

export async function noteCreate(req: Request, res: Response) {
  const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
  res.status(201).json(await addNote({ caseId: id(req), authorId: currentUser(req).id, body }));
}

export async function status(req: Request, res: Response) {
  const { status } = z.object({ status: z.enum(['OPEN', 'ANALYZING', 'REVIEW', 'CLOSED']) }).parse(req.body);
  res.json(await setStatus(id(req), status, currentUser(req).id));
}

const analyzeSchema = z.object({
  walletId: z.uuid(),
  maxHops: z.number().int().min(1).max(MAX_HOPS_LIMIT).default(4),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export async function analyze(req: Request, res: Response) {
  res.json(await analyzeWallet({ ...analyzeSchema.parse(req.body), caseId: id(req), userId: currentUser(req).id }));
}

export async function attributions(req: Request, res: Response) {
  res.json(await listAttributions(id(req)));
}

export async function riskScore(req: Request, res: Response) {
  const { walletId, maxHops } = z.object({ walletId: z.uuid(), maxHops: z.number().int().min(1).max(MAX_HOPS_LIMIT).default(3) }).parse(req.body);
  res.json(await scoreWallet({ walletId, maxHops, caseId: id(req), userId: currentUser(req).id }));
}

export async function riskScores(req: Request, res: Response) {
  res.json(await listRiskScores(id(req)));
}

export async function audit(req: Request, res: Response) {
  res.json(await listCaseAudit(id(req)));
}

export async function dashboard(_req: Request, res: Response) {
  res.json(await dashboardSummary());
}

export async function reportCreate(req: Request, res: Response) {
  res.status(201).json(await generateReport(id(req), currentUser(req)));
}

export async function reportList(req: Request, res: Response) {
  res.json(await listReports(id(req)));
}

export async function reportJson(req: Request, res: Response) {
  res.json(await getReport(id(req), z.uuid().parse(req.params.reportId)));
}

export async function reportPdf(req: Request, res: Response) {
  const report = await getReport(id(req), z.uuid().parse(req.params.reportId));
  const pdf = await renderReportPdf(report.content);
  await recordAudit({ action: 'REPORT_EXPORTED', userId: currentUser(req).id, caseId: id(req), target: report.id, metadata: { format: 'pdf' } });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="report-${report.content.case.caseNumber ?? report.id}.pdf"`).send(pdf);
}

export async function sahyogList(req: Request, res: Response) {
  res.json(await listRequests(id(req)));
}

export async function sahyogPrepare(req: Request, res: Response) {
  const body = z.object({ kind: z.enum(['SYNC', 'DISCLOSURE', 'FREEZE']), walletId: z.uuid().optional() }).parse(req.body);
  res.status(201).json(await prepareRequest({ caseId: id(req), ...body, userId: currentUser(req).id }));
}

export async function sahyogSubmit(req: Request, res: Response) {
  const { legalReference } = z.object({ legalReference: z.string().trim().min(3).max(500) }).parse(req.body);
  res.json(await submitRequest({ caseId: id(req), id: z.uuid().parse(req.params.requestId), legalReference, userId: currentUser(req).id }));
}

export async function sahyogAdvance(req: Request, res: Response) {
  res.json(await advanceRequest({ caseId: id(req), id: z.uuid().parse(req.params.requestId), userId: currentUser(req).id }));
}
