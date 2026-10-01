import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import Admin from './pages/Admin';
import CaseDetail from './pages/CaseDetail';
import Cases from './pages/Cases';
import Dashboard from './pages/Dashboard';
import Vasps from './pages/Vasps';

// The backend runs on a free host that sleeps when idle; the first request can take
// about a minute while it wakes, so explain the wait instead of a bare "Loading…".
function Booting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="p-8 text-sm text-muted" role="status">
      <p>{slow ? 'Waking up the investigation server…' : 'Loading…'}</p>
      {slow && <p className="mt-1 text-xs text-faint">The demo backend is on free hosting and sleeps when idle. The first load can take up to a minute; later pages are fast.</p>}
    </div>
  );
}

// No login page: the session is established automatically (see AuthContext). This
// gate only shows the boot/retry state while that silent sign-in is in flight.
function Gate({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  if (loading) return <Booting />;
  if (!user)
    return (
      <div className="p-8 text-sm text-muted">
        <p>{error ?? 'Session unavailable.'}</p>
        <button className="mt-3 rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brandhover" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Gate><Layout /></Gate>}>
            <Route index element={<Dashboard />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="vasps" element={<Vasps />} />
            <Route path="admin" element={<Gate admin><Admin /></Gate>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
