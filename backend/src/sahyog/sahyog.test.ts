import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app.js';
import { prisma } from '../database/client.js';

let server: Server;
let base: string;
let inv: Record<string, string>;
const call = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', ...inv }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async <T>(res: Response) => (await res.json()) as T;

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'investigator@demo.local', password: process.env.DEMO_PASSWORD ?? 'demo-password-change-me' }),
  });
  inv = { authorization: `Bearer ${(await json<{ token: string }>(res)).token}` };
});
afterAll(async () => { server.close(); await prisma.$disconnect(); });

async function analysedCase(address = '0xSUSPECT001') {
  const c = await json<{ id: string }>(await call('POST', '/api/cases', { title: 'sahyog test' }));
  const w = await json<{ walletId: string }>(await call('POST', `/api/cases/${c.id}/wallets`, { chain: 'ETHEREUM', address }));
  return { caseId: c.id, walletId: w.walletId };
}

describe('SAHYOG mock integration', () => {
  it('prepares, submits (mock) and advances a disclosure request, distinguishing Prepared from Submitted', async () => {
    const { caseId, walletId } = await analysedCase();
    await call('POST', `/api/cases/${caseId}/analyze`, { walletId, maxHops: 3 });

    const prep = await call('POST', `/api/cases/${caseId}/sahyog`, { kind: 'DISCLOSURE', walletId });
    expect(prep.status).toBe(201);
    const r = await json<{ id: string; status: string; mockReference: string | null; payload: { target: { name: string }; notice: string } }>(prep);
    expect(r.status).toBe('PREPARED');
    expect(r.mockReference).toBeNull();
    expect(r.payload.target.name).toMatch(/Demo/);
    expect(r.payload.notice).toMatch(/inference/i);

    expect((await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/advance`)).status).toBe(409); // not submitted
    expect((await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/submit`, {})).status).toBe(400); // legal reference required

    const sub = await json<{ status: string; mockReference: string }>(await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/submit`, { legalReference: 'FIR 12/2026' }));
    expect(sub.status).toBe('SUBMITTED');
    expect(sub.mockReference).toMatch(/^MOCK-SAHYOG-/);
    expect((await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/submit`, { legalReference: 'again' })).status).toBe(409);

    expect((await json<{ status: string }>(await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/advance`))).status).toBe('ACKNOWLEDGED');
    expect((await json<{ status: string }>(await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/advance`))).status).toBe('FULFILLED');
    expect((await call('POST', `/api/cases/${caseId}/sahyog/${r.id}/advance`)).status).toBe(409);

    const list = await json<{ notice: string; requests: { id: string; history: unknown[] }[] }>(await call('GET', `/api/cases/${caseId}/sahyog`));
    expect(list.notice).toMatch(/MOCK/);
    expect(list.requests[0]?.history).toHaveLength(4);
    const actions = (await prisma.auditLog.findMany({ where: { caseId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['SAHYOG_PREPARED', 'SAHYOG_SUBMITTED_MOCK', 'SAHYOG_STATUS_UPDATED_MOCK']));
  });

  it('prepares a case sync and a freeze request; refuses disclosure/freeze without an attributed VASP', async () => {
    const { caseId, walletId } = await analysedCase();
    const sync = await call('POST', `/api/cases/${caseId}/sahyog`, { kind: 'SYNC' });
    expect(sync.status).toBe(201);
    expect((await call('POST', `/api/cases/${caseId}/sahyog`, { kind: 'FREEZE', walletId })).status).toBe(422);
    expect((await call('POST', `/api/cases/${caseId}/sahyog`, { kind: 'FREEZE' })).status).toBe(400);

    await call('POST', `/api/cases/${caseId}/analyze`, { walletId, maxHops: 3 });
    const freeze = await json<{ payload: { request: { type: string; addressesToFreeze: string[] } } }>(await call('POST', `/api/cases/${caseId}/sahyog`, { kind: 'FREEZE', walletId }));
    expect(freeze.payload.request.addressesToFreeze).toHaveLength(1);
  });

  it('requires authentication and a wallet from the same case', async () => {
    const a = await analysedCase();
    const b = await analysedCase('0xSUSPECT002');
    expect((await fetch(`${base}/api/cases/${a.caseId}/sahyog`)).status).toBe(401);
    expect((await call('POST', `/api/cases/${a.caseId}/sahyog`, { kind: 'DISCLOSURE', walletId: b.walletId })).status).toBe(400);
  });
});
