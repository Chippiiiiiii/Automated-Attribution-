import { prisma } from '../database/client.js';
import { HttpError } from '../middleware/errors.js';
import { recordAudit } from '../services/audit.service.js';
import { buildReportContent, type ReportContent } from './report.builder.js';

export async function generateReport(caseId: string, user: { id: string; name: string; email: string }) {
  const content = await buildReportContent(caseId, { name: user.name, email: user.email });
  const row = await prisma.investigationReport.create({ data: { caseId, generatedById: user.id, content: content as object } });
  await recordAudit({ action: 'REPORT_GENERATED', userId: user.id, caseId, target: row.id });
  return { id: row.id, createdAt: row.createdAt };
}

export async function listReports(caseId: string) {
  const rows = await prisma.investigationReport.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, content: true } });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, generatedBy: (r.content as unknown as ReportContent).generatedBy.name }));
}

export async function getReport(caseId: string, reportId: string) {
  const row = await prisma.investigationReport.findFirst({ where: { id: reportId, caseId } });
  if (!row) throw new HttpError(404, 'Report not found');
  return { id: row.id, createdAt: row.createdAt, content: row.content as unknown as ReportContent };
}
