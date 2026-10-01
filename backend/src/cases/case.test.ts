import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app.js';
import { prisma } from '../database/client.js';

let server: Server;
let base: string;
let investigatorId: string;
let auth: Record<string, string>;

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  investigatorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'investigator@demo.local' } })).id;
  auth = { authorization: `Bearer ${await loginToken('investigator@demo.local')}` };
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const password = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';

const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function loginToken(email: string) {
  const res = await post('/api/auth/login', { email, password }, {});
  return (await res.json()).token as string;
}

describe('authentication and authorization', () => {
  it('rejects missing, malformed and forged tokens', async () => {
    expect((await fetch(`${base}/api/cases`)).status).toBe(401);
    expect((await fetch(`${base}/api/cases`, { headers: { authorization: 'Bearer nonsense' } })).status).toBe(401);
    const forged = jwt.sign({ sub: investigatorId }, 'x'.repeat(32));
    expect((await fetch(`${base}/api/cases`, { headers: { authorization: `Bearer ${forged}` } })).status).toBe(401);
  });

  it('rejects wrong passwords and unknown users with the same error', async () => {
    const wrong = await post('/api/auth/login', { email: 'investigator@demo.local', password: 'nope' }, {});
    const unknown = await post('/api/auth/login', { email: 'ghost@demo.local', password: 'nope' }, {});
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it('never returns the password hash', async () => {
    const res = await post('/api/auth/login', { email: 'investigator@demo.local', password }, {});
    expect(JSON.stringify(await res.json())).not.toContain('passwordHash');
  });

  it('limits admin config to admins', async () => {
    expect((await fetch(`${base}/api/admin/config`, { headers: auth })).status).toBe(403);
    const admin = { authorization: `Bearer ${await loginToken('admin@demo.local')}` };
    const res = await fetch(`${base}/api/admin/config`, { headers: admin });
    expect(res.status).toBe(200);
    expect((await res.json()).chains).toContain('SOLANA');
  });

  it('stops accepting tokens of deactivated users', async () => {
    const email = `deactivated-${Date.now()}@demo.local`;
    const user = await prisma.user.create({ data: { email, name: 'Temp', passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: investigatorId } })).passwordHash } });
    const token = await loginToken(email);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await fetch(`${base}/api/cases`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe('cases API', () => {
  it('creates a case with a formatted number and audit event, then reads it back', async () => {
    const res = await post('/api/cases', { title: 'TEST case' });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.caseNumber).toMatch(/^CASE-\d{4}-\d{5}$/);
    expect(created.status).toBe('OPEN');

    const got = await (await fetch(`${base}/api/cases/${created.id}`, { headers: auth })).json();
    expect(got.title).toBe('TEST case');

    const audit = await prisma.auditLog.findFirst({ where: { caseId: created.id, action: 'CASE_CREATED' } });
    expect(audit?.userId).toBe(investigatorId);
  });

  it('rejects invalid input and unknown cases', async () => {
    expect((await post('/api/cases', { title: '' })).status).toBe(400);
    expect((await fetch(`${base}/api/cases/${crypto.randomUUID()}`, { headers: auth })).status).toBe(404);
  });

  it('audit log rejects update and delete at the database level', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'X' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});

describe('demo reset', () => {
  it('is admin-only and returns demo cases to a clean OPEN state while keeping the audit trail', async () => {
    expect((await post('/api/admin/demo-reset', {})).status).toBe(403);
    const demo = await prisma.case.findFirstOrThrow({ where: { title: { startsWith: 'DEMO S1:' } } });
    await post(`/api/cases/${demo.id}/notes`, { body: 'evaluator note' });
    await prisma.case.update({ where: { id: demo.id }, data: { status: 'REVIEW' } });
    const auditBefore = await prisma.auditLog.count({ where: { caseId: demo.id } });

    const admin = { authorization: `Bearer ${await loginToken('admin@demo.local')}` };
    const res = await post('/api/admin/demo-reset', {}, admin);
    expect(res.status).toBe(200);
    expect((await res.json()).cases).toContain(demo.caseNumber);

    const after = await prisma.case.findUniqueOrThrow({ where: { id: demo.id }, include: { notes: true, wallets: true } });
    expect(after.status).toBe('OPEN');
    expect(after.notes).toHaveLength(0);
    expect(after.wallets).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { caseId: demo.id } })).toBe(auditBefore + 1);
  });
});
