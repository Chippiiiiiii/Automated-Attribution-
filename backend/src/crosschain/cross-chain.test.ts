import { describe, expect, it } from 'vitest';
import { attribute } from '../attribution/engine.js';
import { attributeAcrossChains } from './cross-chain.js';
import { buildGraph } from '../graph/build-graph.js';
import { findBridgeLinks } from './bridge.js';

describe('cross-chain attribution (S4: Ethereum → bridge → Polygon)', () => {
  it('single-chain analysis alone finds no VASP', async () => {
    const r = await attribute({ chain: 'ETHEREUM', walletAddress: '0xSUSPECT401', maxHops: 4 });
    expect(r.nearestVasp).toBeNull();
  });

  it('matches the bridge deposit to its Polygon release', async () => {
    const graph = await buildGraph({ chain: 'ETHEREUM', address: '0xSUSPECT401', maxHops: 3 });
    const [link] = await findBridgeLinks(graph, 'ETHEREUM');
    expect(link).toMatchObject({ bridgeId: 'BR-401', destChain: 'POLYGON', matchedBy: 'srcTxHash' });
    expect(link!.dest?.to).toBe('0xrecipient401');
  });

  it('follows funds across the bridge to the Polygon exchange, with a bridge hop and penalty', async () => {
    const r = await attributeAcrossChains({ chain: 'ETHEREUM', walletAddress: '0xSUSPECT401', maxHops: 5 });
    expect(r.nearestVasp?.vasp.name).toBe('Demo Exchange Polygon');
    expect(r.transactionPath.map((h) => h.chain)).toEqual(['ETHEREUM', 'POLYGON', 'POLYGON']);
    expect(r.transactionPath.filter((h) => h.bridgeId)).toHaveLength(1);
    expect(r.evidence.some((e) => e.factor === 'bridgeCrossing' && e.points < 0)).toBe(true);
    expect(r.bridgeLinks?.[0]?.bridgeId).toBe('BR-401');
    expect(r.confidence).toBeGreaterThan(0);
    // The evidence table must add up to the reported confidence (weights sum to 110 by default).
    const total = r.evidence.reduce((n, f) => n + f.points, 0);
    expect(r.confidence).toBe(Math.round((total / 110) * 100));
    expect(r.distance).toBe(3);
    expect(r.evidence.find((f) => f.factor === 'PROXIMITY')?.detail).toMatch(/3 hops/);
  });

  it('does not cross the bridge when the hop budget is too small', async () => {
    const r = await attributeAcrossChains({ chain: 'ETHEREUM', walletAddress: '0xSUSPECT401', maxHops: 1 });
    expect(r.nearestVasp).toBeNull();
  });

  it('leaves single-chain results untouched', async () => {
    const r = await attributeAcrossChains({ chain: 'ETHEREUM', walletAddress: '0xSUSPECT001', maxHops: 4 });
    expect(r.bridgeLinks).toBeUndefined();
    expect(r.distance).toBe(2);
  });
});
