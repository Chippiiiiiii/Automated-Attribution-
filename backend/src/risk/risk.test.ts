import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app.js';
import { prisma } from '../database/client.js';
import { assessWallet } from './engine.js';
import { DEFAULT_RISK_CONFIG, riskConfigSchema } from './config.js';
import { assessRisk, levelFor, type RiskFacts } from './scoring.js';

const quiet: RiskFacts = {
  mixerHops: null, bridgeSeen: false, bridgeDetail: null, otcHops: null, holdHours: null,
  forwardedShare: 0, distinctRecipients: 1, unlabeledChain: 0, similarTransfers: 1,
};

describe('risk scoring', () => {
  it('scores nothing for a quiet wallet', () => {
    const r = assessRisk(quiet, DEFAULT_RISK_CONFIG);
    expect(r.score).toBe(0);
    expect(r.level).toBe('LOW');
    expect(r.indicators.every((i) => !i.triggered && i.points === 0)).toBe(true);
  });

  it('caps at 100 and explains every triggered indicator', () => {
    const loud: RiskFacts = { ...quiet, mixerHops: 1, bridgeSeen: true, otcHops: 1, holdHours: 1, forwardedShare: 1, distinctRecipients: 9, unlabeledChain: 4, similarTransfers: 5 };
    const cfg = { ...DEFAULT_RISK_CONFIG, points: { ...DEFAULT_RISK_CONFIG.points, mixerExposure: 100 } };
    const r = assessRisk(loud, cfg);
    expect(r.score).toBe(100);
    expect(r.level).toBe('CRITICAL');
    expect(r.indicators.filter((i) => i.triggered)).toHaveLength(7);
  });

  it('level boundaries follow the configured thresholds', () => {
    expect(levelFor(24, DEFAULT_RISK_CONFIG.levels)).toBe('LOW');
    expect(levelFor(25, DEFAULT_RISK_CONFIG.levels)).toBe('MEDIUM');
    expect(levelFor(50, DEFAULT_RISK_CONFIG.levels)).toBe('HIGH');
    expect(levelFor(75, { medium: 10, high: 20, critical: 30 })).toBe('CRITICAL');
    expect(riskConfigSchema.safeParse({ ...DEFAULT_RISK_CONFIG, levels: { medium: 50, high: 40, critical: 90 } }).success).toBe(false);
  });
});

describe('risk on demo scenarios', () => {
  it('S3 mixer wallet is HIGH because of mixer exposure', async () => {
    const r = await assessWallet('TRON', 'TSUSPECT301', 3);
    expect(r.indicators.find((i) => i.id === 'mixerExposure')?.triggered).toBe(true);
    expect(r.level).toBe('HIGH');
  });
  it('S4 wallet is flagged for bridge usage', async () => {
    const r = await assessWallet('ETHEREUM', '0xSUSPECT401', 3);
    expect(r.indicators.find((i) => i.id === 'bridgeUsage')?.triggered).toBe(true);
  });
  it('S2 wallet has no mixer or bridge indicators', async () => {
    const r = await assessWallet('ETHEREUM', '0xSUSPECT001', 3);
    expect(r.indicators.filter((i) => i.triggered).map((i) => i.id)).not.toContain('mixerExposure');
    expect(r.indicators.filter((i) => i.triggered).map((i) => i.id)).not.toContain('bridgeUsage');
  });
});

describe('risk API', () => {
  let server: Server;
  let base: string;
  let inv: Record<string, string>;
  const password = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';
  const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
    fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (email: string) => ({
    authorization: `Bearer ${((await (await call('POST', '/api/auth/login', {}, { email, password })).json()) as { token: string }).token}`,
  });

  beforeAll(async () => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    inv = await login('investigator@demo.local');
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  it('scores a case wallet, stores it and audits it; risk config is admin-only', async () => {
    const c = (await (await call('POST', '/api/cases', inv, { title: 'risk api' })).json()) as { id: string };
    const { walletId } = (await (await call('POST', `/api/cases/${c.id}/wallets`, inv, { chain: 'TRON', address: 'TSUSPECT301' })).json()) as { walletId: string };
    const res = await call('POST', `/api/cases/${c.id}/risk`, inv, { walletId });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { level: string }).level).toBe('HIGH');
    expect(((await (await call('GET', `/api/cases/${c.id}/risk`, inv)).json()) as unknown[]).length).toBe(1);
    expect((await prisma.auditLog.findMany({ where: { caseId: c.id, action: 'RISK_SCORED' } })).length).toBe(1);
    expect((await call('PUT', '/api/admin/risk-config', inv, DEFAULT_RISK_CONFIG)).status).toBe(403);
    expect((await call('POST', `/api/cases/${c.id}/risk`, inv, { walletId: crypto.randomUUID() })).status).toBe(404);
  });
});
