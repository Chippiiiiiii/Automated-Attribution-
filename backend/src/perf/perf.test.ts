import { describe, expect, it } from 'vitest';
import { build } from '../blockchain/demo/builder.js';
import { buildGraph } from '../graph/build-graph.js';
import { findPaths } from '../graph/paths.js';

const source = (transfers: ReturnType<typeof build>[]) => (async (_c: string, a: string) => (a === '0xsuspect' ? transfers : [])) as never;

describe('graph performance regression', () => {
  it('handles 50k transfers on a single edge in linear time (was quadratic)', async () => {
    const ts = Array.from({ length: 50_000 }, (_, i) => build({ chain: 'ETHEREUM', key: `p${i}`, from: '0xsuspect', to: '0xvasp', amount: '1', token: 'ETH', atHour: i % 400 }));
    const t = performance.now();
    const g = await buildGraph({ chain: 'ETHEREUM', address: '0xsuspect', maxHops: 2, source: source(ts) });
    expect(g.edges[0]!.txCount).toBe(50_000);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it('builds and searches a 1k-node fan-out quickly and deduplicates repeated transfers', async () => {
    const ts = Array.from({ length: 2000 }, (_, i) => build({ chain: 'ETHEREUM', key: `f${i % 1000}`, from: '0xsuspect', to: `0x${(i % 1000).toString(16).padStart(6, '0')}`, amount: '1', token: 'ETH', atHour: 1 }));
    const t = performance.now();
    const g = await buildGraph({ chain: 'ETHEREUM', address: '0xsuspect', maxHops: 3, source: source(ts) });
    expect(g.edges).toHaveLength(1000);
    expect(g.edges.reduce((n, e) => n + e.txCount, 0)).toBe(1000); // duplicates ignored
    findPaths(g, { isTarget: (k) => k.endsWith('000007') });
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
