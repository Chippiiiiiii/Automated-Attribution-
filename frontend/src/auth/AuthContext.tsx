import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../api/client';
import type { AuthUser } from '../api/types';

// The backend still requires a JWT on every route (auth + audit trail stay intact).
// There is no login page: the app silently signs in as the seeded DEMO account on
// boot so evaluators land straight in the console. These are synthetic DEMO-only
// credentials (see .env.example / render.yaml); change ADMIN -> investigator here to
// restrict what the auto-session can reach.
const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'demo-password-change-me';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
    tokenStore.set(r.data.token);
    setUser(r.data.user);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const existing = tokenStore.get();
      if (existing) {
        try {
          const r = await api.get<AuthUser>('/auth/me');
          if (!cancelled) setUser(r.data);
          return;
        } catch {
          tokenStore.clear();
        }
      }
      try {
        await login(DEMO_EMAIL, DEMO_PASSWORD);
      } catch {
        if (!cancelled) setError('Could not reach the investigation service. Please retry shortly.');
      }
    }
    boot().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [login]);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, login, logout }), [user, loading, error, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
