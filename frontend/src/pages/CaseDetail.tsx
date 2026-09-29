import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { CHAINS, type Attribution, type AuditEntry, type CaseDetail as CaseData, type CaseStatus, type Chain, type StoredAttribution, type StoredRisk, type TransferDto } from '../api/types';
import { SahyogPanel } from '../components/SahyogPanel';
import { GraphPanel } from '../components/GraphPanel';
import { btn, btnGhost, Card, ClassBadge, ConfidenceBar, DemoBadge, DISCLAIMER, ErrorText, fmtDate, input, RiskBadge, shortAddr, StatusBadge } from '../components/ui';

const STATUSES: CaseStatus[] = ['OPEN', 'ANALYZING', 'REVIEW', 'CLOSED'];

function TransactionsPanel({ chain, address }: { chain: Chain; address: string }) {
  const [rows, setRows] = useState<TransferDto[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setRows(null); setError('');
    api.get<TransferDto[]>(`/wallets/${chain}/${address}/transactions`, { params: { limit: 200 } })
      .then((r) => { if (live) setRows(r.data); })
      .catch((e) => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [chain, address]);
  return (
    <Card title={`Transactions · ${chain}:${shortAddr(address)}`}>
      <ErrorText>{error}</ErrorText>
      {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No transfers found for this wallet.</p>}
      {rows && rows.length > 0 && (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-surface text-muted"><tr><th className="py-1 pr-2">Tx</th><th className="pr-2">From</th><th className="pr-2">To</th><th className="pr-2">Amount</th><th className="pr-2">Time</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.txHash}-${t.transferIndex}`} className="border-t border-line">
                  <td className="py-1 pr-2"><code title={t.txHash}>{shortAddr(t.txHash)}</code></td>
                  <td className="pr-2"><code title={t.from}>{shortAddr(t.from)}</code></td>
                  <td className="pr-2"><code title={t.to}>{shortAddr(t.to)}</code></td>
                  <td className="pr-2 tabular-nums">{t.amount} {t.token}</td>
                  <td className="pr-2">{fmtDate(t.timestamp)}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function CaseDetail() {
  const { id = '' } = useParams();
  const [data, setData] = useState<CaseData | null>(null);
  const [attributions, setAttributions] = useState<StoredAttribution[]>([]);
  const [risks, setRisks] = useState<StoredRisk[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [reports, setReports] = useState<{ id: string; createdAt: string; generatedBy: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [maxHops, setMaxHops] = useState(4);
  const [chain, setChain] = useState<Chain>('ETHEREUM');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [txFor, setTxFor] = useState<string | null>(null);
  const [graphFor, setGraphFor] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, a, r, l, rp] = await Promise.all([
        api.get<CaseData>(`/cases/${id}`), api.get<StoredAttribution[]>(`/cases/${id}/attributions`),
        api.get<StoredRisk[]>(`/cases/${id}/risk`), api.get<AuditEntry[]>(`/cases/${id}/audit`), api.get<typeof reports>(`/cases/${id}/reports`),
      ]);
      setData(c.data); setAttributions(a.data); setRisks(r.data); setAudit(l.data); setReports(rp.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);

  async function download(url: string, filename: string) {
    try {
      const res = await api.get<Blob>(url, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      void reload();
    } catch (e) { setError(errorMessage(e)); }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try { await fn(); await reload(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  const addWallet = (e: FormEvent) => {
    e.preventDefault();
    void run('wallet', async () => { await api.post(`/cases/${id}/wallets`, { chain, address: address.trim() }); setAddress(''); });
  };
  const addNote = (e: FormEvent) => {
    e.preventDefault();
    void run('note', async () => { await api.post(`/cases/${id}/notes`, { body: note }); setNote(''); });
  };

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-muted">Loading…</p>;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{data.caseNumber} · {data.title}</h1>
          <StatusBadge value={data.status} />
          <label className="ml-auto text-sm text-muted">Status{' '}
            <select className={input} value={data.status} disabled={busy !== null} onChange={(e) => void run('status', () => api.patch(`/cases/${id}/status`, { status: e.target.value }))}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {data.summary && <p className="mt-2 text-sm text-slate-700">{data.summary}</p>}
        <ErrorText>{error}</ErrorText>
      </Card>

      <Card title="Wallets under investigation" actions={
        <label className="text-sm text-muted">Max hops{' '}
          <select className={input} value={maxHops} onChange={(e) => setMaxHops(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select>
        </label>}>
        {data.wallets.length === 0 && <p className="mb-2 text-sm text-muted">No wallets yet. Add a suspect wallet below.</p>}
        <ul className="space-y-2">
          {data.wallets.map((w) => (
            <li key={w.walletId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-panel px-2 py-0.5 text-xs">{w.wallet.chain}</span>
              <code className="break-all">{w.wallet.address}</code>
              <span className="ml-auto flex gap-2">
                <button className={btn} disabled={busy !== null} onClick={() => void run(`analyze-${w.walletId}`, () => api.post(`/cases/${id}/analyze`, { walletId: w.walletId, maxHops }))}>
                  {busy === `analyze-${w.walletId}` ? 'Analysing…' : 'Run attribution'}
                </button>
                <button className={btnGhost} onClick={() => setTxFor(txFor === w.walletId ? null : w.walletId)}>
                  {txFor === w.walletId ? 'Hide transactions' : 'View transactions'}
                </button>
                <button className={btnGhost} onClick={() => setGraphFor(graphFor === w.walletId ? null : w.walletId)}>
                  {graphFor === w.walletId ? 'Hide graph' : 'View graph'}
                </button>
                <button className={btnGhost} disabled={busy !== null} onClick={() => void run(`risk-${w.walletId}`, () => api.post(`/cases/${id}/risk`, { walletId: w.walletId, maxHops: Math.min(maxHops, 3) }))}>
                  {busy === `risk-${w.walletId}` ? 'Scoring…' : 'Score risk'}
                </button>
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={addWallet} className="mt-3 flex flex-wrap gap-2">
          <select className={input} value={chain} onChange={(e) => setChain(e.target.value as Chain)}>{CHAINS.map((c) => <option key={c}>{c}</option>)}</select>
          <input className={`${input} min-w-72 flex-1`} placeholder="Wallet address" value={address} onChange={(e) => setAddress(e.target.value)} required />
          <button className={btn} disabled={busy !== null}>Add wallet</button>
        </form>
      </Card>

      {data.wallets.filter((w) => w.walletId === txFor).map((w) => (
        <TransactionsPanel key={w.walletId} chain={w.wallet.chain} address={w.wallet.address} />
      ))}

      {data.wallets.filter((w) => w.walletId === graphFor).map((w) => (
        <GraphPanel key={w.walletId} chain={w.wallet.chain} address={w.wallet.address}
          path={attributions.find((a) => a.wallet.address === w.wallet.address && a.wallet.chain === w.wallet.chain)?.detail.transactionPath ?? []} />
      ))}

      {attributions.map((a, i) => <AttributionCard key={a.id} stored={a} latest={i === 0} />)}
      {risks.length > 0 && (
        <Card title="Risk assessments">
          <div className="space-y-4">
            {risks.map((r) => (
              <div key={r.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <code>{r.wallet.chain}:{shortAddr(r.wallet.address)}</code><RiskBadge value={r.level} /><span>score {r.score}/100</span>
                  <span className="text-xs text-faint">{fmtDate(r.createdAt)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {r.detail.indicators.map((x) => (
                    <li key={x.id} className={x.triggered ? 'text-amber-300' : 'text-faint'}>{x.triggered ? '▲' : '·'} {x.label} ({x.triggered ? `+${x.points}` : '0'}): {x.detail}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-faint">{r.detail.disclaimer}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Investigation reports" actions={
        <button className={btn} disabled={busy !== null || attributions.length === 0} title={attributions.length === 0 ? 'Run an attribution first' : undefined}
          onClick={() => void run('report', () => api.post(`/cases/${id}/reports`))}>
          {busy === 'report' ? 'Generating…' : 'Generate report'}
        </button>}>
        {reports.length === 0 && <p className="text-sm text-muted">No reports yet. A report snapshots the latest attribution, risk, notes and audit trail; it is stored and can be re-downloaded as PDF or JSON.</p>}
        <ul className="space-y-1 text-sm">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span>{fmtDate(r.createdAt)}</span><span className="text-muted">by {r.generatedBy}</span>
              <span className="ml-auto flex gap-2">
                <button className={btnGhost} onClick={() => void download(`/cases/${id}/reports/${r.id}/pdf`, `report-${r.id}.pdf`)}>Download PDF</button>
                <button className={btnGhost} onClick={() => void download(`/cases/${id}/reports/${r.id}`, `report-${r.id}.json`)}>Download JSON</button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <SahyogPanel caseId={data.id} wallets={data.wallets} onChange={() => void reload()} />

      <Card title="Notes">
        <form onSubmit={addNote} className="flex gap-2">
          <input className={`${input} flex-1`} placeholder="Add an investigator note" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={5000} />
          <button className={btn} disabled={busy !== null}>Add note</button>
        </form>
        <ul className="mt-3 space-y-2 text-sm">
          {data.notes.map((n) => <li key={n.id}><span className="text-xs text-faint">{fmtDate(n.createdAt)}</span><br />{n.body}</li>)}
        </ul>
      </Card>

      <Card title="Audit trail">
        <ul className="space-y-1 text-xs text-slate-700">
          {audit.map((a) => <li key={a.id}><span className="text-faint">{fmtDate(a.createdAt)}</span> · <b>{a.action}</b>{a.user ? ` · ${a.user}` : ''}{a.target ? ` · ${a.target}` : ''}</li>)}
        </ul>
        <p className="mt-2 text-xs text-faint">Audit entries are append-only; the database rejects edits and deletions.</p>
      </Card>
    </>
  );
}

function AttributionCard({ stored, latest }: { stored: StoredAttribution; latest: boolean }) {
  const [open, setOpen] = useState(latest);
  const d: Attribution = stored.detail;
  const best = d.nearestVasp;
  return (
    <Card title={`Attribution · ${stored.wallet.chain}:${shortAddr(stored.wallet.address)}`} actions={<button className={btnGhost} onClick={() => setOpen(!open)}>{open ? 'Hide detail' : 'Show detail'}</button>}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {best ? <><b>{best.vasp.name}</b>{best.vasp.isDemo && <DemoBadge />}</> : <b>No VASP identified</b>}
        <ClassBadge value={d.classification} /><ConfidenceBar value={d.confidence} />
        {d.distance !== null && <span className="text-muted">{d.distance} hop(s)</span>}
        <span className="text-xs text-faint">{fmtDate(stored.createdAt)}</span>
      </div>
      {open && (
        <div className="mt-3 space-y-4 text-sm">
          <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted">Why this result</h3>
            <ul className="list-disc space-y-1 pl-5 text-slate-700">{d.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
          {d.evidence.length > 0 && (
            <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted">Evidence</h3>
              <p className="mb-1 text-xs text-faint">Points are raw factor scores (maximum shown per factor). Their sum is normalised to the 0–100 confidence, then any penalties are subtracted.</p>
              <table className="w-full text-left text-xs"><tbody>
                {d.evidence.map((e) => <tr key={e.factor} className="border-t border-line"><td className="py-1 pr-2">{e.factor}</td><td className="pr-2 tabular-nums">{e.points}{e.maxPoints ? ` / ${e.maxPoints}` : ''}</td><td className="text-muted">{e.detail}</td></tr>)}
              </tbody></table></div>
          )}
          {d.transactionPath.length > 0 && (
            <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted">Transaction path</h3>
              <ol className="space-y-1 text-xs">
                {d.transactionPath.map((h, i) => (
                  <li key={i} className={h.bridgeId ? 'text-violet-800' : ''}>
                    {i + 1}. {h.chain && <span className="text-faint">[{h.chain}] </span>}<code>{shortAddr(h.from)}</code>{h.fromLabel && ` (${h.fromLabel})`} → <code>{shortAddr(h.to)}</code>{h.toLabel && ` (${h.toLabel})`} · {h.amount} {h.token}
                    {h.bridgeId ? ` · bridge ${h.bridgeId}` : ` · ${h.txCount} tx`}
                  </li>
                ))}
              </ol></div>
          )}
          {d.candidates.length > 1 && (
            <div><h3 className="mb-1 text-xs font-semibold uppercase text-muted">All candidates</h3>
              <table className="w-full text-left text-xs"><thead className="text-faint"><tr><th>VASP</th><th>Hops</th><th>Amount</th><th>Confidence</th><th>Class</th></tr></thead><tbody>
                {d.candidates.map((c) => <tr key={c.vasp.vaspId + c.hops} className="border-t border-line"><td className="py-1">{c.vasp.name}</td><td>{c.hops}</td><td>{c.amount} {c.token}</td><td>{c.confidence}</td><td><ClassBadge value={c.classification} /></td></tr>)}
              </tbody></table></div>
          )}
          <p className="text-xs text-faint">{d.disclaimer || DISCLAIMER}</p>
        </div>
      )}
    </Card>
  );
}
