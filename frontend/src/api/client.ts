import axios from 'axios';

const TOKEN_KEY = 'sih2.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// In dev the Vite proxy serves `/api`. In production set VITE_API_URL to the
// backend's public URL (e.g. https://sih2-backend.onrender.com/api).
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });
api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
    tokenStore.clear();
    window.location.assign('/login');
  }
  return Promise.reject(err);
});

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { error?: string; message?: string; details?: unknown } | undefined;
    return d?.error ?? d?.message ?? (err.response ? `Request failed (${err.response.status})` : 'API unreachable');
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}
