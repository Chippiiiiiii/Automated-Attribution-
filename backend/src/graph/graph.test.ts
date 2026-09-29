import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from '../blockchain/types.js';
import { buildGraph, serializeGraph } from './build-graph.js';
import { findPaths, hopDistance } from './paths.js';
import { nodeKey, type TransferSource } from './types.js';

const T0 = Date.UTC(2026, 0, 1);
const tx = (from: string, to: string, amount: string, hour: number, token = 'ETH', id = `${from}${to}${hour}`): NormalizedTransaction => ({
  txHash: id, transferIndex: 0, chain: 'ETHEREUM', from, to, amount, token, timestamp: new Date(T0 + hour * 3_600_000).toISOString(), blockNumber: hour, status: 'SUCCESS',
});

const ledgerSource = (ledger: NormalizedTransaction[]): TransferSource => async (_c, addr) => ledger.filter((t) => t.from === addr || t.to === addr);
const key = (a: string) => nodeKey('ETHEREUM', a);

const chain = [tx('a', 'b', '5', 1), tx('b', 'c', '4.9', 2), tx('c', 'exchange', '4.8', 3)];
const graphOf = (ledger: NormalizedTransaction[], maxHops = 5, extra = {}) =>
  buildGraph({ chain: 'ETHEREUM', address: 'a', maxHops, source: ledgerSource(ledger), ...extra });

describe('graph traversal', () => {
  it('A → B → C → Exchange has distance 3', async () => {
    const g = await graphOf(chain);
    expect(hopDistance(g, (k) => k === key('exchange'))).toBe(3);
    expect(g.nodes.get(key('exchange'))?.depth).toBe(3);
    const [path] = findPaths(g, { isTarget: (k) => k === key('exchange') });
    expect(path!.nodes).toEqual(['a', 'b', 'c', 'exchange'].map(key));
    expect(path!.bottleneckAmount.toString()).toBe('4.8');
  });

  it('respects maxHops', async () => {
    const g = await graphOf(chain, 2);
    expect(g.nodes.has(key('exchange'))).toBe(false);
    expect(hopDistance(g, (k) => k === key('exchange'))).toBeNull();
  });

  it('aggregates parallel transfers into one edge', async () => {
    const g = await graphOf([tx('a', 'b', '1', 1), tx('a', 'b', '2.5', 2)]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ txCount: 2 });
    expect(g.edges[0]!.totalAmount.toString()).toBe('3.5');
  });

  it('ignores paths that would spend funds before they arrive', async () => {
    // c → exchange happened BEFORE b → c, so a's money cannot have flowed that way.
    const g = await graphOf([tx('a', 'b', '5', 5), tx('b', 'c', '5', 6), tx('c', 'exchange', '5', 1)]);
    expect(hopDistance(g, (k) => k === key('exchange'))).toBeNull();
    expect(g.nodes.has(key('exchange'))).toBe(true); // still visible topologically
  });

  it('only counts transfers after arrival on a later hop', async () => {
    const g = await graphOf([tx('a', 'b', '5', 5), tx('b', 'c', '1', 1), tx('b', 'c', '4', 8)]);
    const [p] = findPaths(g, { isTarget: (k) => k === key('c') });
    expect(p!.hops[1]!.amount.toString()).toBe('4');
  });

  it('prefers the shorter of two routes and reports both', async () => {
    const g = await graphOf([tx('a', 'x', '1', 1), tx('x', 'y', '1', 2), tx('y', 'ex', '1', 3), tx('a', 'ex', '9', 4)]);
    const paths = findPaths(g, { isTarget: (k) => k === key('ex') });
    expect(paths.map((p) => p.distance)).toEqual([1, 3]);
  });

  it('handles cycles without looping', async () => {
    const g = await graphOf([tx('a', 'b', '1', 1), tx('b', 'a', '1', 2), tx('b', 'c', '1', 3)]);
    expect(findPaths(g, { isTarget: (k) => k === key('c') })).toHaveLength(1);
  });

  it('does not extend a path past its first target', async () => {
    const g = await graphOf(chain);
    const paths = findPaths(g, { isTarget: (k) => k === key('b') || k === key('exchange') });
    expect(paths.map((p) => p.nodes.at(-1))).toEqual([key('b')]);
  });

  it('filters by amount, token and time', async () => {
    const ledger = [tx('a', 'b', '5', 1), tx('a', 'c', '0.01', 2), tx('a', 'd', '3', 3, 'USDT'), tx('a', 'e', '3', 100)];
    expect([...(await graphOf(ledger, 1, { minAmount: '1' })).nodes.keys()].sort()).toEqual(['a', 'b', 'd', 'e'].map(key));
    expect([...(await graphOf(ledger, 1, { tokens: ['USDT'] })).nodes.keys()].sort()).toEqual(['a', 'd'].map(key));
    const g = await buildGraph({ chain: 'ETHEREUM', address: 'a', maxHops: 1, to: new Date(T0 + 10 * 3_600_000), source: async (_c, a, f) => ledgerSource(ledger)(_c, a, f).then((r) => r.filter((t) => !f.to || new Date(t.timestamp) <= f.to)) });
    expect(g.nodes.has(key('e'))).toBe(false);
  });

  it('truncates at maxNodes and says so', async () => {
    const fan = Array.from({ length: 20 }, (_, i) => tx('a', `n${i}`, '1', i + 1));
    const g = await graphOf(fan, 1, { maxNodes: 5 });
    expect(g.truncated).toBe(true);
    expect(g.nodes.size).toBe(5);
  });

  it('rejects maxHops beyond the limit', async () => {
    await expect(graphOf(chain, 99)).rejects.toThrow(RangeError);
  });

  it('serialises to JSON-safe output', async () => {
    const json = JSON.parse(JSON.stringify(serializeGraph(await graphOf(chain))));
    expect(json.edges[0].totalAmount).toBe('5');
    expect(json.nodes).toHaveLength(4);
  });
});

describe('graph over the DEMO ledger', () => {
  it('scenario S2 reaches the deposit at 2 hops and the hot wallet at 3', async () => {
    const g = await buildGraph({ chain: 'ETHEREUM', address: '0xSUSPECT001', maxHops: 4 });
    expect(hopDistance(g, (k) => k === nodeKey('ETHEREUM', '0xdeposit001'))).toBe(2);
    expect(hopDistance(g, (k) => k === nodeKey('ETHEREUM', '0xexchangehot001'))).toBe(3);
  });

  it('scenario S1 (Bitcoin) reaches the deposit at 1 hop with 3 transfers', async () => {
    const g = await buildGraph({ chain: 'BITCOIN', address: 'bc1DEMOSUSPECT101', maxHops: 3 });
    const [p] = findPaths(g, { isTarget: (k) => k === nodeKey('BITCOIN', 'bc1DEMODEPOSIT101') });
    expect(p!.distance).toBe(1);
    expect(p!.hops[0]!.transfers).toHaveLength(3);
    expect(p!.bottleneckAmount.toString()).toBe('2.45');
  });
});

describe('graph API enrichment', () => {
  it('labels nodes with intel and reports bridge links', async () => {
    const { createApp } = await import('../api/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const { env } = await import('../config/env.js');
    const { prisma } = await import('../database/client.js');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'investigator@demo.local' } });
    const server = createApp().listen(0);
    try {
      const port = (server.address() as import('node:net').AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/graph/ETHEREUM/0xSUSPECT401?maxHops=3`, {
        headers: { authorization: `Bearer ${jwt.sign({ sub: user.id }, env.JWT_SECRET, { algorithm: 'HS256' })}` },
      });
      const g = (await res.json()) as { nodes: { address: string; intel: { name: string } | null }[]; bridgeLinks: { bridgeId: string }[] };
      expect(g.nodes.find((n) => n.address === '0xbridge401')?.intel?.name).toBe('Demo Bridge');
      expect(g.bridgeLinks[0]?.bridgeId).toBe('BR-401');
    } finally {
      server.close();
    }
  });
});
