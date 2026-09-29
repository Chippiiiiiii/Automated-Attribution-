import PDFDocument from 'pdfkit';
import type { ReportContent } from './report.builder.js';

const d = (v: string | Date) => new Date(v).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/** Renders stored report content to a PDF buffer. Pure function of the content. */
export function renderReportPdf(r: ReportContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Investigation report ${r.case.caseNumber ?? r.case.id}`, Author: 'Blockchain Attribution Workbench' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const h = (t: string) => { doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(t).moveDown(0.3); body(); };
    const body = () => doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
    const line = (t: string) => doc.text(t);
    const demoNote = (isDemo: boolean) => (isDemo ? ' [DEMO]' : '');

    doc.font('Helvetica-Bold').fontSize(18).text('Blockchain Investigation Report');
    doc.font('Helvetica').fontSize(9).fillColor('#b45309').text('DEMO MODE — synthetic data. Nothing here is a real-world attribution.');
    body();
    doc.moveDown(0.5);
    line(`Case: ${r.case.caseNumber ?? r.case.id} — ${r.case.title}`);
    line(`Status: ${r.case.status}    Opened: ${d(r.case.createdAt)}`);
    line(`Generated: ${d(r.generatedAt)} by ${r.generatedBy.name}`);
    if (r.case.summary) { doc.moveDown(0.3); line(r.case.summary); }

    h('1. Wallets under investigation');
    if (!r.wallets.length) line('None.');
    for (const w of r.wallets) line(`• ${w.chain}  ${w.address}${w.note ? `  (${w.note})` : ''}`);

    h('2. Attribution findings');
    if (!r.attributions.length) line('No attribution has been run for this case.');
    for (const { generatedAt, result: a } of r.attributions) {
      doc.font('Helvetica-Bold').text(`${a.suspectWallet.chain}  ${a.suspectWallet.address}`); body();
      line(`Analysed: ${d(generatedAt)}   Max hops: ${a.parameters.maxHops}   Time range: ${a.parameters.timeRange.from ?? 'any'} -> ${a.parameters.timeRange.to ?? 'any'}`);
      if (a.nearestVasp) {
        line(`Nearest VASP (inferred): ${a.nearestVasp.vasp.name}${demoNote(a.nearestVasp.vasp.isDemo)} — ${a.classification.replace(/_/g, ' ')}, confidence ${a.confidence}/100, distance ${a.distance} hop(s)`);
        line(`Terminal address: ${a.nearestVasp.terminalAddress}`);
      } else line('No VASP could be attributed within the analysis parameters (UNKNOWN).');
      doc.moveDown(0.3).font('Helvetica-Bold').text('Reasoning'); body();
      for (const t of a.reasoning) line(`• ${t}`);
      if (a.evidence.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Evidence (points contributed)'); body();
        for (const e of a.evidence) line(`• ${e.factor}: ${e.points}/${e.maxPoints} — ${e.detail}`);
      }
      if (a.transactionPath.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Transaction path'); body();
        a.transactionPath.forEach((p, i) => {
          line(`${i + 1}. ${p.chain ?? a.suspectWallet.chain}: ${p.from}${p.fromLabel ? ` (${p.fromLabel})` : ''} -> ${p.to}${p.toLabel ? ` (${p.toLabel})` : ''}`);
          line(`     ${p.amount} ${p.token}, ${p.txCount} tx, ${d(p.firstTimestamp)}${p.bridgeId ? `  [bridge ${p.bridgeId}]` : ''}`);
          if (p.txHashes.length) line(`     tx: ${p.txHashes.slice(0, 3).join(', ')}${p.txHashes.length > 3 ? ' …' : ''}`);
        });
      }
      const others = a.candidates.filter((c) => c.terminalAddress !== a.nearestVasp?.terminalAddress);
      if (others.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Other candidates considered'); body();
        for (const c of others) line(`• ${c.vasp.name}${demoNote(c.vasp.isDemo)} — ${c.confidence}/100 (${c.classification.replace(/_/g, ' ')}), ${c.hops} hop(s)`);
      }
      doc.moveDown(0.6);
    }

    h('3. Risk assessment');
    if (!r.riskAssessments.length) line('No risk assessment has been run for this case.');
    for (const k of r.riskAssessments) {
      doc.font('Helvetica-Bold').text(`${k.wallet.chain}  ${k.wallet.address} — ${k.level} (${k.score}/100)`); body();
      for (const i of k.detail.indicators.filter((x) => x.triggered)) line(`• ${i.label} (+${i.points}): ${i.detail}`);
      if (!k.detail.indicators.some((x) => x.triggered)) line('No risk indicators triggered.');
      doc.moveDown(0.3);
    }

    h('4. Investigator notes');
    if (!r.notes.length) line('None.');
    for (const n of r.notes) line(`[${d(n.createdAt)}] ${n.body}`);

    h('5. Audit trail (most recent first)');
    for (const a of r.auditTrail.slice(0, 40)) line(`${d(a.at)}  ${a.action}${a.user ? `  — ${a.user}` : ''}`);
    if (r.auditTrail.length > 40) line(`… ${r.auditTrail.length - 40} further entries omitted; full trail is retained in the system.`);

    h('6. Limitations and legal notice');
    for (const t of [...r.disclaimers, ...r.limitations]) line(`• ${t}`);

    doc.end();
  });
}
