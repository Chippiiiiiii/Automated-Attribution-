import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { btn, btnGhost, DISCLAIMER, ErrorText, input } from '../components/ui';

// DEMO-only credentials, seeded by the backend (see .env.example / render.yaml).
// Exposed so evaluators can enter without being handed a password. Safe because
// this is synthetic DEMO data and the accounts have no real-world access.
const DEMO_PASSWORD = 'demo-password-change-me';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError('');
    try {
      await login(e, p);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <div className="flex h-1 w-full" aria-hidden>
        <div className="flex-1 bg-saffron" /><div className="flex-1 bg-white" /><div className="flex-1 bg-india-green" />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface shadow-sm">
          <div className="flex items-center gap-3 bg-brand px-6 py-4 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded border border-white/30 bg-white/10 text-sm font-bold">VA</span>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">Blockchain Intelligence</div>
              <div className="text-[11px] text-slate-300">&amp; VASP Attribution Console</div>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3 p-6">
            <label className="block text-sm font-medium text-ink">Email
              <input className={`${input} mt-1 w-full`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-ink">Password
              <input className={`${input} mt-1 w-full`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <ErrorText>{error}</ErrorText>
            <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="space-y-2 border-t border-line px-6 pb-6 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evaluation access — no password needed</p>
            <p className="text-xs text-faint">One click signs you into a DEMO account. All data is synthetic.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void signIn('investigator@demo.local', DEMO_PASSWORD)}>
                Enter as Investigator
              </button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => void signIn('admin@demo.local', DEMO_PASSWORD)}>
                Enter as Admin
              </button>
            </div>
          </div>
          <p className="border-t border-line bg-panel px-6 py-3 text-[11px] text-muted">{DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
