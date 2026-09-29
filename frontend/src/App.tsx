import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import Admin from './pages/Admin';
import CaseDetail from './pages/CaseDetail';
import Cases from './pages/Cases';
import Dashboard from './pages/Dashboard';
import Vasps from './pages/Vasps';

// No login page: the session is established automatically (see AuthContext). This
// gate only shows the boot/retry state while that silent sign-in is in flight.
function Gate({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
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
