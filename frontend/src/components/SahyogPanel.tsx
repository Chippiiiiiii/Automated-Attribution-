import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { CaseDetail, SahyogRequest } from '../api/types';
import { btn, btnGhost, Card, ErrorText, fmtDate, input } from './ui';

const KIND_LABEL = { SYNC: 'Case synchronisation', DISCLOSURE: 'Disclosure request', FREEZE: 'Freeze request' } as const;

function StatusPill({ status }: { status: SahyogRequest['status'] }) {
  const prepared = status === 'PREPARED';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${prepared ? 'bg-brandsoft text-brand' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
      {prepared ? 'PREPARED — not submitted' : `${status} · MOCK`}
    </span>
  );
}

/** SAHYOG integration is a MOCK: "Prepared" is a local draft, every later state is simulated. */
export function SahyogPanel({ caseId, wallets, onChange }: { caseId: string; wallets: CaseDetail['wallets']; onChange: () => void }) {
  const [requests, setRequests] = useState<SahyogRequest[]>([]);
  const [walletId, setWalletId] = useState('');
  const [legal, setLegal] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRequests((await api.get<{ requests: SahyogRequest[] }>(`/cases/${caseId}/sahyog`)).data.requests); } catch (e) { setError(errorMessage(e)); }
  }, [caseId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!walletId && wallets[0]) setWalletId(wallets[0].walletId); }, [wallets, walletId]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await load(); onChange(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const prepare = (kind: SahyogRequest['kind']) => act(() => api.post(`/cases/${caseId}/sahyog`, { kind, walletId: kind === 'SYNC' ? undefined : walletId }));

  return (
    <Card title="SAHYOG requests (MOCK integration)">
      <p className="mb-3 rounded border border-amber-300 bg-amber-100 p-2 text-xs text-amber-900">
        MOCK: no real SAHYOG endpoint is connected. <b>Prepared</b> = drafted locally. <b>Submitted</b> and later states are simulated; nothing is transmitted to any authority or VASP.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={input} value={walletId} onChange={(e) => setWalletId(e.target.value)} disabled={wallets.length === 0}>
          {wallets.map((w) => <option key={w.walletId} value={w.walletId}>{w.wallet.chain}:{w.wallet.address.slice(0, 14)}</option>)}
        </select>
        <button className={btn} disabled={busy} onClick={() => void prepare('SYNC')}>Prepare case sync</button>
        <button className={btn} disabled={busy || !walletId} onClick={() => void prepare('DISCLOSURE')}>Prepare disclosure request</button>
        <button className={btn} disabled={busy || !walletId} onClick={() => void prepare('FREEZE')}>Prepare freeze request</button>
      </div>
      <ErrorText>{error}</ErrorText>
      {requests.length === 0 && <p className="text-sm text-muted">No requests yet. Disclosure and freeze requests need an attribution that identified a VASP.</p>}
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b>{KIND_LABEL[r.kind]}</b><StatusPill status={r.status} />
              {r.mockReference && <code className="text-xs text-muted">{r.mockReference}</code>}
              <span className="ml-auto text-xs text-muted">{fmtDate(r.createdAt)}</span>
            </div>
            <details className="mt-2"><summary className="cursor-pointer text-muted">View prepared content</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded border border-line bg-panel p-2 text-xs">{JSON.stringify(r.payload, null, 2)}</pre>
            </details>
            <ol className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">{r.history.map((h, i) => <li key={i}>{h.status} · {fmtDate(h.at)}</li>)}</ol>
            {r.status === 'PREPARED' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${input} min-w-64 flex-1`} placeholder="Legal authority / reference (required, e.g. FIR no.)" value={legal[r.id] ?? ''} onChange={(e) => setLegal({ ...legal, [r.id]: e.target.value })} />
                <button className={btn} disabled={busy || (legal[r.id] ?? '').trim().length < 3} onClick={() => void act(() => api.post(`/cases/${caseId}/sahyog/${r.id}/submit`, { legalReference: legal[r.id] }))}>Submit (MOCK)</button>
              </div>
            ) : r.status !== 'FULFILLED' && (
              <div className="mt-2"><button className={btnGhost} disabled={busy} onClick={() => void act(() => api.post(`/cases/${caseId}/sahyog/${r.id}/advance`))}>Simulate next response (MOCK)</button></div>
            )}
            {r.legalReference && <p className="mt-1 text-xs text-muted">Legal reference: {r.legalReference}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
