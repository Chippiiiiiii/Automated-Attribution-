import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './api/app.js';
import { prisma } from './database/client.js';
import { DEMO_SCENARIOS } from './blockchain/demo/scenarios.js';

let server: Server; let base: string; let inv: Record<string, string>;
const call = (m: string, p: string, body?: unknown) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...inv }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeAll(async () => {
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'investigator@demo.local', password: process.env.DEMO_PASSWORD ?? 'demo-password-change-me' }) });
  inv = { authorization: `Bearer ${((await r.json()) as { token: string }).token}` };
});
afterAll(async () => { server.close(); await prisma.$disconnect(); });

async function analyze(s: { chain: string; suspect: string; id: string }) {
  const c = (await (await call('POST', '/api/cases', { title: `scenario ${s.id}` })).json()) as { id: string };
  const w = (await (await call('POST', `/api/cases/${c.id}/wallets`, { chain: s.chain, address: s.suspect })).json()) as { walletId: string };
  const a = await (await call('POST', `/api/cases/${c.id}/analyze`, { walletId: w.walletId, maxHops: 4 })).json();
  const r = await (await call('POST', `/api/cases/${c.id}/risk`, { walletId: w.walletId })).json();
  return { a, r } as { a: Record<string, any>; r: Record<string, any> };
}

const EXPECTED: Record<string, { vasp: string; hops: number; cls: string; min: number; max: number; candidates: number; bridges: number; risk: string; triggered: string[] }> = {
  S1: { vasp: 'Demo Exchange Alpha', hops: 1, cls: 'CONFIRMED', min: 90, max: 100, candidates: 1, bridges: 0, risk: 'LOW', triggered: [] },
  S1b: { vasp: 'Demo Exchange Beta', hops: 1, cls: 'STRONGLY_INFERRED', min: 75, max: 89, candidates: 1, bridges: 0, risk: 'LOW', triggered: [] },
  S2: { vasp: 'Demo Exchange', hops: 2, cls: 'STRONGLY_INFERRED', min: 75, max: 89, candidates: 1, bridges: 0, risk: 'LOW', triggered: [] },
  S3: { vasp: 'Demo Exchange Tron', hops: 3, cls: 'PROBABLE', min: 50, max: 74, candidates: 1, bridges: 0, risk: 'HIGH', triggered: ['mixerExposure'] },
  S4: { vasp: 'Demo Exchange Polygon', hops: 3, cls: 'PROBABLE', min: 50, max: 74, candidates: 1, bridges: 1, risk: 'MEDIUM', triggered: ['bridgeUsage'] },
  S5: { vasp: 'Demo Exchange Delta', hops: 2, cls: 'PROBABLE', min: 50, max: 74, candidates: 3, bridges: 0, risk: 'MEDIUM', triggered: ['otcExposure'] },
};

describe('reproducible demo scenarios', () => {
  it('covers direct, two-hop, mixer, bridge and multi-candidate cases', () => {
    expect(DEMO_SCENARIOS.map((s) => s.id)).toEqual(expect.arrayContaining(['S1', 'S2', 'S3', 'S4', 'S5']));
  });

  for (const s of DEMO_SCENARIOS) {
    it(`${s.id} ${s.title}`, async () => {
      const e = EXPECTED[s.id]!;
      const { a, r } = await analyze(s);
      expect(a.nearestVasp.vasp.name).toBe(e.vasp);
      expect(a.nearestVasp.vasp.isDemo).toBe(true);
      expect(a.distance).toBe(e.hops);
      expect(a.classification).toBe(e.cls);
      expect(a.confidence).toBeGreaterThanOrEqual(e.min);
      expect(a.confidence).toBeLessThanOrEqual(e.max);
      expect(a.candidates).toHaveLength(e.candidates);
      expect((a.bridgeLinks ?? []).length).toBe(e.bridges);
      // factor points are raw (weights sum to 110); confidence is that sum normalised to 100
      const raw = a.evidence.reduce((n: number, f: { points: number }) => n + f.points, 0);
      const weightSum = a.evidence.reduce((n: number, f: { maxPoints: number }) => n + f.maxPoints, 0);
      expect(Math.abs((raw / weightSum) * 100 - a.confidence)).toBeLessThan(1);
      expect(r.level).toBe(e.risk);
      const triggered = r.indicators.filter((i: { triggered: boolean }) => i.triggered).map((i: { id: string }) => i.id);
      expect(triggered).toEqual(expect.arrayContaining(e.triggered));
      // deterministic: second run gives the same result
      expect((await analyze(s)).a.confidence).toBe(a.confidence);
    });
  }
});
