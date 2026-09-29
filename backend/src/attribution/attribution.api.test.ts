import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app.js';
import { prisma } from '../database/client.js';
import { DEFAULT_ATTRIBUTION_CONFIG } from './config.js';

let server: Server;
let base: string;
let inv: Record<string, string>;
let admin: Record<string, string>;
const password = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function login(email: string) {
  const res = await call('POST', '/api/auth/login', {}, { email, password });
  return { authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

async function newCaseWithWallet(title: string) {
  const c = (await (await call('POST', '/api/cases', inv, { title })).json()) as { id: string };
  const added = await call('POST', `/api/cases/${c.id}/wallets`, inv, { chain: 'ETHEREUM', address: '0xSUSPECT001' });
  return { caseId: c.id, added, walletId: ((await added.clone().json()) as { walletId: string }).walletId };
}

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  inv = await login('investigator@demo.local');
  admin = await login('admin@demo.local');
});
afterAll(async () => {
  await call('PUT', '/api/admin/attribution-config', admin, DEFAULT_ATTRIBUTION_CONFIG);
  server.close();
  await prisma.$disconnect();
});

describe('case analysis flow', () => {
  it('adds a wallet, analyzes it, stores the result and audits each step', async () => {
    const { caseId, added, walletId } = await newCaseWithWallet('attribution api test');
    expect(added.status).toBe(201);

    const res = await call('POST', `/api/cases/${caseId}/analyze`, inv, { walletId, maxHops: 3 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { confidence: number; disclaimer: string; nearestVasp: { vasp: { isDemo: boolean } } };
    expect(body.confidence).toBeGreaterThan(50);
    expect(body.nearestVasp.vasp.isDemo).toBe(true);
    expect(body.disclaimer).toMatch(/inference/);

    const stored = (await (await call('GET', `/api/cases/${caseId}/attributions`, inv)).json()) as unknown[];
    expect(stored).toHaveLength(1);
    expect(((await (await call('GET', `/api/cases/${caseId}`, inv)).json()) as { status: string }).status).toBe('REVIEW');

    const actions = (await prisma.auditLog.findMany({ where: { caseId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['WALLET_ADDED', 'ANALYSIS_STARTED', 'ANALYSIS_COMPLETED', 'ATTRIBUTION_GENERATED']));
  });

  it('rejects out-of-range hops, foreign wallets and malformed addresses', async () => {
    const c = (await (await call('POST', '/api/cases', inv, { title: 'validation' })).json()) as { id: string };
    expect((await call('POST', `/api/cases/${c.id}/analyze`, inv, { walletId: crypto.randomUUID(), maxHops: 99 })).status).toBe(400);
    expect((await call('POST', `/api/cases/${c.id}/analyze`, inv, { walletId: crypto.randomUUID() })).status).toBe(404);
    expect((await call('POST', `/api/cases/${c.id}/wallets`, inv, { chain: 'ETHEREUM', address: 'bad address!' })).status).toBe(400);
  });
});

describe('attribution config administration', () => {
  it('is admin-only', async () => {
    expect((await call('GET', '/api/admin/attribution-config', inv)).status).toBe(403);
    expect((await call('PUT', '/api/admin/attribution-config', inv, DEFAULT_ATTRIBUTION_CONFIG)).status).toBe(403);
  });

  it('changed thresholds change the classification of the next analysis', async () => {
    const strict = { ...DEFAULT_ATTRIBUTION_CONFIG, thresholds: { confirmed: 99, stronglyInferred: 98, probable: 97, possible: 96 } };
    expect((await call('PUT', '/api/admin/attribution-config', admin, strict)).status).toBe(200);
    const { caseId, walletId } = await newCaseWithWallet('config test');
    const r = (await (await call('POST', `/api/cases/${caseId}/analyze`, inv, { walletId })).json()) as { classification: string };
    expect(r.classification).toBe('LOW_CONFIDENCE');
  });

  it('rejects invalid config with 400', async () => {
    const bad = { ...DEFAULT_ATTRIBUTION_CONFIG, thresholds: { confirmed: 10, stronglyInferred: 20, probable: 30, possible: 40 } };
    expect((await call('PUT', '/api/admin/attribution-config', admin, bad)).status).toBe(400);
  });
});
