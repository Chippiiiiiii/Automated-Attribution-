import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { CaseRow } from '../api/types';
import { btn, Card, ErrorText, fmtDate, input, StatusBadge } from '../components/ui';

export default function Cases() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<CaseRow[]>('/cases').then((r) => setRows(r.data)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post<CaseRow>('/cases', { title, ...(summary.trim() && { summary }) });
      navigate(`/cases/${r.data.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <Card title="New case">
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <input className={`${input} min-w-64 flex-1`} placeholder="Case title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          <input className={`${input} min-w-64 flex-1`} placeholder="Summary (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <button className={btn}>Create case</button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Card>
      <Card title="Cases">
        {!rows ? <p className="text-sm text-muted">Loading…</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-1">Case</th><th>Title</th><th>Status</th><th>Wallets</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-2"><Link className="text-brand hover:underline" to={`/cases/${c.id}`}>{c.caseNumber}</Link></td>
                  <td>{c.title}</td><td><StatusBadge value={c.status} /></td><td>{c._count?.wallets ?? 0}</td><td className="text-muted">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
