import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AppOptions } from '../api/app.js';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';

const password = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';
const servers: Server[] = [];
function start(opts?: AppOptions) {
  const s = createApp(opts).listen(0);
  servers.push(s);
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
let base: string;
let inv: Record<string, string>;
let adm: Record<string, string>;
const req = (b: string, method: string, path: string, headers: Record<string, string> = {}, body?: unknown, raw = false) =>
  fetch(b + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body) });
const call = (method: string, path: string, headers: Record<string, string> = inv, body?: unknown) => req(base, method, path, headers, body);
const login = async (b: string, email: string, pw = password) => {
  const res = await req(b, 'POST', '/api/auth/login', {}, { email, password: pw });
  const auth: Record<string, string> = res.ok ? { authorization: `Bearer ${((await res.clone().json()) as { token: string }).token}` } : {};
  return { res, auth };
};

beforeAll(async () => {
  base = start();
  inv = (await login(base, 'investigator@demo.local')).auth;
  adm = (await login(base, 'admin@demo.local')).auth;
});
afterAll(async () => { servers.forEach((s) => s.close()); await prisma.$disconnect(); });

const PROTECTED_GETS = [
  '/api/auth/me', '/api/cases', '/api/cases/summary', '/api/wallets/ETHEREUM/0xabc', '/api/graph/ETHEREUM/0xabc', '/api/intel/vasps',
  '/api/admin/config', '/api/admin/providers', '/api/admin/attribution-config', '/api/admin/risk-config',
];

describe('authentication', () => {
  it('rejects every protected endpoint without a token', async () => {
    for (const p of PROTECTED_GETS) expect((await call('GET', p, {})).status, p).toBe(401);
  });

  it('rejects malformed, tampered, unsigned, wrongly-signed and expired tokens', async () => {
    const good = inv.authorization!.slice(7);
    const sub = (jwt.decode(good) as { sub: string }).sub;
    const [h, p, s] = good.split('.');
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.`;
    const bad = [
      'garbage', '', `${h}.${p}.${s!.slice(0, -2)}xx`, noneAlg,
      jwt.sign({ sub }, 'x'.repeat(40)),
      jwt.sign({ sub }, env.JWT_SECRET, { expiresIn: -10 }),
      jwt.sign({ sub }, env.JWT_SECRET, { algorithm: 'HS512' }),
      jwt.sign({ sub: '00000000-0000-4000-8000-000000000000' }, env.JWT_SECRET),
    ];
    for (const t of bad) expect((await call('GET', '/api/auth/me', { authorization: `Bearer ${t}` })).status, t.slice(0, 20)).toBe(401);
    expect((await call('GET', '/api/auth/me', { authorization: good })).status).toBe(401); // missing "Bearer "
    expect((await call('GET', '/api/auth/me')).status).toBe(200);
  });

  it('gives identical errors for unknown user and wrong password, and handles hostile input without a 500', async () => {
    const a = await login(base, 'nobody@demo.local', 'x');
    const b = await login(base, 'investigator@demo.local', 'wrong');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(await a.res.json()).toEqual(await b.res.json());
    expect((await login(base, "investigator@demo.local' OR '1'='1", "' OR '1'='1")).res.status).toBe(400);
    expect((await req(base, 'POST', '/api/auth/login', {}, { email: 'a@b.co', password: { $ne: 1 } })).status).toBe(400);
    expect((await req(base, 'POST', '/api/auth/login', {}, { email: 'investigator@demo.local', password: 'x'.repeat(5000) })).status).toBe(400);
  });

  it('revokes access immediately when a user is deactivated', async () => {
    const email = `tmp-${Date.now()}@demo.local`;
    const user = await prisma.user.create({ data: { email, name: 'Temp', passwordHash: await bcrypt.hash('temp-password-1', 4) } });
    const { auth } = await login(base, email, 'temp-password-1');
    expect((await call('GET', '/api/auth/me', auth)).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await call('GET', '/api/auth/me', auth)).status).toBe(401);
    expect((await login(base, email, 'temp-password-1')).res.status).toBe(401);
  });
});

describe('authorization', () => {
  it('blocks investigators from admin endpoints, allows admins', async () => {
    for (const p of ['/api/admin/config', '/api/admin/providers', '/api/admin/attribution-config', '/api/admin/risk-config']) {
      expect((await call('GET', p, inv)).status, p).toBe(403);
      expect((await call('GET', p, adm)).status, p).toBe(200);
    }
    expect((await call('PUT', '/api/admin/attribution-config', inv, {})).status).toBe(403);
    expect((await call('PUT', '/api/admin/risk-config', inv, {})).status).toBe(403);
  });

  it('never returns secrets from admin/config endpoints', async () => {
    const text = JSON.stringify([await (await call('GET', '/api/admin/config', adm)).json(), await (await call('GET', '/api/admin/providers', adm)).json()]);
    expect(text).not.toContain(env.JWT_SECRET);
    expect(text).not.toContain(env.DATABASE_URL);
    expect(text).not.toMatch(/passwordHash/);
  });
});

describe('input validation and injection', () => {
  const payloads = ["' OR 1=1 --", "'; DROP TABLE cases; --", '1; SELECT pg_sleep(5)', '../../etc/passwd', '%00', '<script>alert(1)</script>', '${7*7}'];

  it('rejects hostile path parameters with 4xx and never 5xx', async () => {
    for (const pl of payloads) {
      const enc = encodeURIComponent(pl);
      for (const p of [`/api/wallets/ETHEREUM/${enc}`, `/api/graph/ETHEREUM/${enc}`, `/api/intel/ETHEREUM/${enc}`, `/api/wallets/${enc}/0xabc`, `/api/cases/${enc}`, `/api/cases/${enc}/audit`]) {
        const s = (await call('GET', p)).status;
        expect(s, `${p}`).toBeGreaterThanOrEqual(400);
        expect(s, `${p}`).toBeLessThan(500);
      }
    }
  });

  it('rejects hostile query parameters', async () => {
    for (const q of ['maxHops=99', 'maxHops=0', 'maxHops=1;DROP', 'direction=sideways', "minAmount=1' OR 1=1", 'from=not-a-date', `token=${'A'.repeat(50)}`]) {
      expect((await call('GET', `/api/graph/ETHEREUM/0xsuspect001?${q}`)).status, q).toBe(400);
    }
  });

  it('stores injection / markup payloads as inert text and leaves the schema intact', async () => {
    const title = `'); DROP TABLE cases;-- <img src=x onerror=alert(1)>`;
    const created = await call('POST', '/api/cases', inv, { title, summary: '<script>alert(1)</script>' });
    expect(created.status).toBe(201);
    const c = (await created.json()) as { id: string; title: string };
    const fetched = await call('GET', `/api/cases/${c.id}`);
    expect(fetched.headers.get('content-type')).toContain('application/json');
    expect(fetched.headers.get('x-content-type-options')).toBe('nosniff');
    expect(((await fetched.json()) as { title: string; summary: string })).toMatchObject({ title, summary: '<script>alert(1)</script>' });
    expect(await prisma.case.count()).toBeGreaterThan(0);
    const note = await call('POST', `/api/cases/${c.id}/notes`, inv, { body: '"><svg onload=alert(1)>' });
    expect(note.status).toBe(201);
  });

  it('enforces size and shape limits', async () => {
    const c = (await (await call('POST', '/api/cases', inv, { title: 'limits' })).json()) as { id: string };
    expect((await call('POST', `/api/cases/${c.id}/notes`, inv, { body: 'x'.repeat(5001) })).status).toBe(400);
    expect((await call('POST', '/api/cases', inv, { title: '' })).status).toBe(400);
    expect((await call('POST', '/api/cases', inv, { title: 'x'.repeat(201) })).status).toBe(400);
    expect((await call('POST', `/api/cases/${c.id}/wallets`, inv, { chain: 'DOGE', address: '0xabc' })).status).toBe(400);
    expect((await call('POST', `/api/cases/${c.id}/wallets`, inv, { chain: 'ETHEREUM', address: "0x' OR 1=1" })).status).toBe(400);
    expect((await call('POST', `/api/cases/${c.id}/analyze`, inv, { walletId: 'not-a-uuid' })).status).toBe(400);
    expect((await call('POST', `/api/cases/${c.id}/analyze`, inv, { walletId: '00000000-0000-4000-8000-000000000000', maxHops: 50 })).status).toBe(400);
  });

  it('answers malformed and oversized JSON bodies with 400 / 413, not 500', async () => {
    expect((await req(base, 'POST', '/api/cases', inv, '{"title": ', true)).status).toBe(400);
    expect((await req(base, 'POST', '/api/cases', inv, JSON.stringify({ title: 'x'.repeat(200_000) }), true)).status).toBe(413);
  });
});

describe('transport headers and CORS', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });

  it('only allows the configured CORS origin', async () => {
    const evil = await fetch(`${base}/api/health`, { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).not.toBe('*');
    const ok = await fetch(`${base}/api/health`, { headers: { origin: env.CORS_ORIGIN } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(env.CORS_ORIGIN);
  });
});

describe('rate limiting', () => {
  it('throttles repeated login attempts', async () => {
    const b = start({ loginLimit: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await login(b, 'investigator@demo.local', 'wrong')).res.status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('throttles expensive analysis endpoints and the API as a whole', async () => {
    const b = start({ heavyLimit: 2, apiLimit: 12 });
    const { auth } = await login(b, 'investigator@demo.local');
    const heavy: number[] = [];
    for (let i = 0; i < 4; i++) heavy.push((await req(b, 'POST', '/api/cases/00000000-0000-4000-8000-000000000000/analyze', auth, {})).status);
    expect(heavy.slice(0, 2)).not.toContain(429);
    expect(heavy.slice(2)).toEqual([429, 429]);
    const all: number[] = [];
    for (let i = 0; i < 12; i++) all.push((await req(b, 'GET', '/api/intel/vasps', auth)).status);
    expect(all).toContain(429);
  });
});
