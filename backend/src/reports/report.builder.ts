import { listAttributions } from '../attribution/attribution.service.js';
import { ATTRIBUTION_DISCLAIMER, type AttributionResult } from '../attribution/types.js';
import { getCase, listCaseAudit } from '../cases/case.service.js';
import { RISK_DISCLAIMER, type RiskReport } from '../risk/engine.js';
import { listRiskScores } from '../risk/risk.service.js';

export const REPORT_LIMITATIONS = [
  'Attribution is a probabilistic inference from on-chain transfer patterns and labelled address intelligence; it does not establish identity or beneficial ownership.',
  'Address labels may be incomplete or wrong. Demo-labelled entities are synthetic.',
  'Results depend on the transfer data available to the configured providers and on the analysis parameters listed in this report.',
  'Findings should be corroborated (e.g. through lawful requests to the identified VASP) before any action is taken.',
];

/** Snapshot of a case's findings, stored verbatim so a report can be re-rendered exactly as generated. */
export async function buildReportContent(caseId: string, generatedBy: { name: string; email: string }) {
  const [c, attributions, risks, audit] = await Promise.all([getCase(caseId), listAttributions(caseId), listRiskScores(caseId), listCaseAudit(caseId)]);
  const latest = <T extends { wallet: { chain: string; address: string } }>(rows: T[]) => {
    const seen = new Set<string>();
    return rows.filter((r) => { const k = `${r.wallet.chain}:${r.wallet.address}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy,
    case: { id: c.id, caseNumber: c.caseNumber, title: c.title, summary: c.summary, status: c.status, createdAt: c.createdAt },
    wallets: c.wallets.map((w) => ({ chain: w.wallet.chain, address: w.wallet.address, role: w.role, note: w.note })),
    attributions: latest(attributions).map((a) => ({ generatedAt: a.createdAt, result: a.detail as unknown as AttributionResult })),
    riskAssessments: latest(risks).map((r) => ({ generatedAt: r.createdAt, wallet: r.wallet, score: r.score, level: r.level, detail: r.detail as unknown as RiskReport })),
    notes: c.notes.map((n) => ({ createdAt: n.createdAt, body: n.body })),
    auditTrail: audit.slice(0, 200).map((a) => ({ at: a.createdAt, action: a.action, user: a.user, target: a.target })),
    disclaimers: [ATTRIBUTION_DISCLAIMER, RISK_DISCLAIMER],
    limitations: REPORT_LIMITATIONS,
  };
}
export type ReportContent = Awaited<ReturnType<typeof buildReportContent>>;
