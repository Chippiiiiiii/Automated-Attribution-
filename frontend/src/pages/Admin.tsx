import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { btn, btnGhost, Card, ErrorText, fmtDate } from '../components/ui';

function ConfigEditor({ title, path, hint }: { title: string; path: string; hint: string }) {
  const [text, setText] = useState('');
  const [initial, setInitial] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get(path).then((r) => { const t = JSON.stringify(r.data, null, 2); setText(t); setInitial(t); }).catch((e) => setMsg({ ok: false, text: errorMessage(e) }));
  }, [path]);

  async function save() {
    setMsg(null);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return setMsg({ ok: false, text: 'Not valid JSON.' }); }
    try {
      const r = await api.put(path, parsed);
      const t = JSON.stringify(r.data, null, 2);
      setText(t); setInitial(t);
      setMsg({ ok: true, text: `Saved ${fmtDate(new Date().toISOString())}. The change is recorded in the audit log.` });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  }

  return (
    <Card title={title} actions={<div className="flex gap-2"><button className={btnGhost} disabled={text === initial} onClick={() => setText(initial)}>Revert</button><button className={btn} disabled={text === initial} onClick={save}>Save</button></div>}>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <textarea className="h-72 w-full rounded-md border border-line bg-surface p-2 font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label={title} />
      {msg && (msg.ok ? <p className="text-sm text-emerald-400">{msg.text}</p> : <ErrorText>{msg.text}</ErrorText>)}
    </Card>
  );
}

interface ProviderStatus {
  mode: 'DEMO' | 'LIVE';
  chains: { chain: string; active: string; liveAdapter: string | null; keyEnv: string; keyConfigured: boolean; keyRequired: boolean; ready: boolean }[];
}

function ProviderCard() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get<ProviderStatus>('/admin/providers').then((r) => setStatus(r.data)).catch((e) => setError(errorMessage(e))); }, []);
  return (
    <Card title="Blockchain data providers">
      <ErrorText>{error}</ErrorText>
      {status && (
        <>
          <p className="mb-2 text-xs text-muted">
            Mode <b>{status.mode}</b> (set <code>BLOCKCHAIN_PROVIDER</code> and API keys in the server environment; keys are never shown here).
            {status.mode === 'DEMO' && ' DEMO uses the built-in synthetic ledger; no keys are needed.'}
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th>Chain</th><th>Active source</th><th>Live adapter</th><th>API key</th><th>Ready</th></tr></thead>
            <tbody>
              {status.chains.map((c) => (
                <tr key={c.chain} className="border-t border-line">
                  <td className="py-1">{c.chain}</td><td>{c.active}</td><td>{c.liveAdapter ?? 'not implemented'}</td>
                  <td>{c.keyConfigured ? 'configured' : c.keyRequired ? `missing (${c.keyEnv})` : 'not set (optional)'}</td>
                  <td>{c.ready ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function DemoResetCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    if (!window.confirm('Reset all DEMO cases? Their attributions, risk scores, reports, notes and SAHYOG drafts are removed, statuses go back to OPEN and scoring config to defaults. Audit entries are kept.')) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ cases: string[] }>('/admin/demo-reset');
      setMsg({ ok: true, text: `Reset ${r.data.cases.length} demo case(s) and scoring config. Recorded in the audit log.` });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Demo data" actions={<button className={btn} disabled={busy} onClick={() => void reset()}>{busy ? 'Resetting…' : 'Reset demo'}</button>}>
      <p className="text-sm text-muted">Returns the seeded DEMO cases to a clean state before a demonstration. Cases you created yourself are not changed, and the append-only audit trail is kept.</p>
      {msg && (msg.ok ? <p className="mt-2 text-sm text-emerald-700">{msg.text}</p> : <ErrorText>{msg.text}</ErrorText>)}
    </Card>
  );
}

export default function Admin() {
  return (
    <>
      <DemoResetCard />
      <ProviderCard />
      <ConfigEditor title="Attribution scoring" path="/admin/attribution-config" hint="Factor weights, penalties and classification thresholds (must be strictly decreasing). Applies to the next analysis." />
      <ConfigEditor title="Risk scoring" path="/admin/risk-config" hint="Indicator points, detection parameters and level thresholds (medium < high < critical)." />
    </>
  );
}
