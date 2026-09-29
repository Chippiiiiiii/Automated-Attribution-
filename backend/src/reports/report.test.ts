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

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'investigator@demo.local', password: process.env.DEMO_PASSWORD ?? 'demo-password-change-me' }),
  });
  inv = { authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
});
afterAll(async () => { server.close(); await prisma.$disconnect(); });

describe('investigation reports', () => {
  it('generates a stored report and renders it as PDF, auditing both', async () => {
    const c = (await (await call('POST', '/api/cases', { title: 'report test', summary: 'demo' })).json()) as { id: string };
    const w = (await (await call('POST', `/api/cases/${c.id}/wallets`, { chain: 'ETHEREUM', address: '0xSUSPECT001' })).json()) as { walletId: string };
    await call('POST', `/api/cases/${c.id}/analyze`, { walletId: w.walletId, maxHops: 3 });
    await call('POST', `/api/cases/${c.id}/risk`, { walletId: w.walletId });
    await call('POST', `/api/cases/${c.id}/notes`, { body: 'note for report' });

    const created = await call('POST', `/api/cases/${c.id}/reports`);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const list = (await (await call('GET', `/api/cases/${c.id}/reports`)).json()) as { id: string }[];
    expect(list.map((r) => r.id)).toContain(id);

    const json = (await (await call('GET', `/api/cases/${c.id}/reports/${id}`)).json()) as { content: { attributions: unknown[]; riskAssessments: unknown[]; notes: { body: string }[]; disclaimers: string[] } };
    expect(json.content.attributions).toHaveLength(1);
    expect(json.content.riskAssessments).toHaveLength(1);
    expect(json.content.notes[0]?.body).toBe('note for report');
    expect(json.content.disclaimers.join(' ')).toMatch(/inference/i);

    const pdf = await call('GET', `/api/cases/${c.id}/reports/${id}/pdf`);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    const buf = Buffer.from(await pdf.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);

    const actions = (await prisma.auditLog.findMany({ where: { caseId: c.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['REPORT_GENERATED', 'REPORT_EXPORTED']));
  });

  it('404s for a report of another case and rejects unauthenticated access', async () => {
    const c = (await (await call('POST', '/api/cases', { title: 'other' })).json()) as { id: string };
    expect((await call('GET', `/api/cases/${c.id}/reports/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await fetch(`${base}/api/cases/${c.id}/reports`)).status).toBe(401);
  });
});
