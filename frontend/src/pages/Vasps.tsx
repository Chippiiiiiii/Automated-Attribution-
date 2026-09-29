import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { VaspRow } from '../api/types';
import { Card, DemoBadge, ErrorText, input } from '../components/ui';

export default function Vasps() {
  const [rows, setRows] = useState<VaspRow[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<VaspRow[]>('/intel/vasps').then((r) => setRows(r.data)).catch((e) => setError(errorMessage(e)));
  }, []);
  const shown = rows?.filter((v) => `${v.entity.name} ${v.aliases.join(' ')} ${v.entity.type}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="VASP directory" actions={<input className={input} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <ErrorText>{error}</ErrorText>
      {!shown ? <p className="text-sm text-muted">Loading…</p> : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1">Name</th><th>Type</th><th>Jurisdiction</th><th>Known addresses</th><th>Source</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id} className="border-t border-line">
                <td className="py-2">{v.entity.name} {v.entity.isDemo && <DemoBadge />}</td>
                <td>{v.entity.type}</td><td>{v.jurisdiction}</td><td>{v._count.addresses}</td>
                <td className="text-xs text-faint">{v.entity.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
