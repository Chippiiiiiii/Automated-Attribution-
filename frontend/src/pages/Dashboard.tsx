import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../api/client';
import type { CaseStatus, RiskLevel, Summary } from '../api/types';
import { Card, ClassBadge, ErrorText, fmtDate } from '../components/ui';

const STATUSES: CaseStatus[] = ['OPEN', 'ANALYZING', 'REVIEW', 'CLOSED'];
const LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LEVEL_COLOR: Record<RiskLevel, string> = { LOW: '#34d399', MEDIUM: '#fbbf24', HIGH: '#fb923c', CRITICAL: '#f87171' };

export default function Dashboard() {
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Summary>('/cases/summary').then((r) => setS(r.data)).catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!s) return <p className="text-sm text-muted">Loading…</p>;

  const riskData = LEVELS.map((l) => ({ level: l, count: s.riskLevels[l] ?? 0 }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STATUSES.map((st) => (
          <Card key={st}><p className="text-xs text-muted">Cases · {st.toLowerCase()}</p><p className="text-2xl font-semibold">{s.casesByStatus[st] ?? 0}</p></Card>
        ))}
        <Card><p className="text-xs text-muted">Wallets tracked</p><p className="text-2xl font-semibold">{s.wallets}</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Risk assessments by level">
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
        </Card>
        <Card title="Latest attributions">
          {s.latestAttributions.length === 0 ? (
            <p className="text-sm text-muted">No analyses yet. Open a case and run an analysis.</p>
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
