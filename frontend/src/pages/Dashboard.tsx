import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../api/client';
import type { CaseRow, CaseStatus, RiskLevel, Summary } from '../api/types';
import { btn, Card, ClassBadge, ErrorText, fmtDate, StatusBadge } from '../components/ui';

const STATUSES: CaseStatus[] = ['OPEN', 'ANALYZING', 'REVIEW', 'CLOSED'];
const LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LEVEL_COLOR: Record<RiskLevel, string> = { LOW: '#34d399', MEDIUM: '#fbbf24', HIGH: '#fb923c', CRITICAL: '#f87171' };

export default function Dashboard() {
  const [s, setS] = useState<Summary | null>(null);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get<Summary>('/cases/summary'), api.get<CaseRow[]>('/cases')])
      .then(([sum, list]) => { setS(sum.data); setCases(list.data); })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!s || !cases) return <p className="text-sm text-muted">Loading…</p>;

  const riskData = LEVELS.map((l) => ({ level: l, count: s.riskLevels[l] ?? 0 }));
  const hasRisk = riskData.some((d) => d.count > 0);
  const active = cases.filter((c) => c.status !== 'CLOSED');
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STATUSES.map((st) => (
          <Card key={st}><p className="text-xs text-muted">Cases · {st.toLowerCase()}</p><p className="text-2xl font-semibold">{s.casesByStatus[st] ?? 0}</p></Card>
        ))}
        <Card><p className="text-xs text-muted">Wallets tracked</p><p className="text-2xl font-semibold">{s.wallets}</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card title="Cases to investigate" actions={<Link className="text-xs font-semibold text-brand hover:underline" to="/cases">All cases →</Link>}>
            {active.length === 0 ? (
              <p className="text-sm text-muted">No active cases. <Link className="font-semibold text-brand underline underline-offset-2" to="/cases">Create a case</Link> to begin.</p>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link className="font-semibold text-brand hover:underline" to={`/cases/${c.id}`}>{c.title}</Link>
                      <p className="font-mono text-xs text-muted">{c.caseNumber} · {c._count?.wallets ?? 0} wallet{c._count?.wallets === 1 ? '' : 's'}</p>
                    </div>
                    <StatusBadge value={c.status} />
                    <Link className={`${btn} whitespace-nowrap`} to={`/cases/${c.id}`}>Open &amp; analyse →</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="How to investigate">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-ink">
            <li><span className="font-semibold">Pick a case</span> from the list, or create one with a suspect wallet.</li>
            <li><span className="font-semibold">Run attribution</span> on a wallet to trace funds hop by hop to a VASP.</li>
            <li><span className="font-semibold">Score risk</span> to measure mixer, bridge and exchange exposure.</li>
            <li><span className="font-semibold">Generate a report</span> (PDF/JSON) with evidence and audit trail.</li>
          </ol>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Risk assessments by level">
          {!hasRisk ? (
            <p className="text-sm text-muted">No risk assessments yet. Open a case and click <span className="font-semibold">Score risk</span> on a wallet.</p>
          ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="level" stroke="#566475" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#566475" fontSize={12} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d3dce6', color: '#12212f' }} />
                <Bar dataKey="count">{riskData.map((d) => <Cell key={d.level} fill={LEVEL_COLOR[d.level]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
        <Card title="Latest attributions">
          {s.latestAttributions.length === 0 ? (
            <p className="text-sm text-muted">No analyses yet. <Link className="font-semibold text-brand underline underline-offset-2" to="/cases">Open a case</Link> and run an analysis.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.latestAttributions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="text-brand hover:underline" to={`/cases/${a.caseId}`}>{a.caseNumber}</Link>
                  <span className="text-slate-700">{a.vasp ?? 'No VASP found'}</span>
                  <ClassBadge value={a.classification} />
                  <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
