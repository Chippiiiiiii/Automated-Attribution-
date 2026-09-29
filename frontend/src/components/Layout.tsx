import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DISCLAIMER } from './ui';

interface Health { providerMode: string; sahyogMode: string }

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/15 text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white'
  }`;

/** Thin national tricolor rule used as an official signalling band. */
function TricolorRule() {
  return (
    <div className="flex h-1 w-full" aria-hidden>
      <div className="flex-1 bg-saffron" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-india-green" />
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    api.get<Health>('/health').then((r) => setHealth(r.data)).catch(() => setHealth(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <TricolorRule />
      {health?.providerMode === 'DEMO' && (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900">
          DEMONSTRATION MODE — all blockchain data, VASPs and labels are synthetic. Nothing here is real-world attribution.
        </div>
      )}
      <header className="bg-brand text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded border border-white/30 bg-white/10 text-sm font-bold tracking-tight">VA</span>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">Blockchain Intelligence &amp; VASP Attribution</div>
              <div className="text-[11px] text-slate-300">Cyber Investigation Console</div>
            </div>
          </div>
          <nav className="ml-2 flex flex-wrap gap-1">
            <NavLink to="/" end className={link}>Dashboard</NavLink>
            <NavLink to="/cases" className={link}>Cases</NavLink>
            <NavLink to="/vasps" className={link}>VASP Directory</NavLink>
            {user?.role === 'ADMIN' && <NavLink to="/admin" className={link}>Admin</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-200">{user?.name} · <span className="uppercase tracking-wide text-slate-300">{user?.role.toLowerCase()}</span></span>
            <button className="rounded border border-white/30 px-2.5 py-1 text-sm font-medium hover:bg-white/10" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4"><Outlet /></main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted">{DISCLAIMER}</div>
      </footer>
    </div>
  );
}
