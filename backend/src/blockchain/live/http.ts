import { HttpError } from '../../middleware/errors.js';

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with timeout and bounded retry on network errors, 429 and 5xx. URLs are never logged (they can carry API keys). */
export async function getJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const { fetchImpl = fetch, timeoutMs = 10_000, retries = 2, backoffMs = 300, headers } = opts;
  let lastError = 'unknown error';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      lastError = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // 4xx other than 429 will not improve on retry
    } catch (e) {
      lastError = e instanceof Error ? e.name : 'network error';
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
  }
  throw new HttpError(502, `Blockchain data provider request failed (${lastError})`);
}
