import { describe, expect, it } from 'vitest';
import { attribute } from './engine.js';
import { DEFAULT_ATTRIBUTION_CONFIG, attributionConfigSchema } from './config.js';
import { classify } from './scoring.js';

const run = (chain: 'BITCOIN' | 'ETHEREUM' | 'TRON' | 'SOLANA', walletAddress: string, maxHops = 4) =>
  attribute({ chain, walletAddress, maxHops });

describe('attribution on demo scenarios', () => {
  it('S1: direct deposit is attributed with very high confidence', async () => {
    const r = await run('BITCOIN', 'bc1DEMOSUSPECT101');
    expect(r.distance).toBe(1);
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('S2: two-hop path via an intermediary is found and is not "confirmed"', async () => {
    const r = await run('ETHEREUM', '0xSUSPECT001');
    expect(r.distance).toBe(2);
    expect(r.intermediaryAddresses).toHaveLength(1);
    expect(r.classification).not.toBe('CONFIRMED');
  });

  it('S3: mixer on path is penalised', async () => {
    const r = await run('TRON', 'TSUSPECT301');
    expect(r.nearestVasp).not.toBeNull();
    expect(r.evidence.some((e) => e.points < 0)).toBe(true);
  });

  it('S5: reports several candidates and explains the ranking', async () => {
    const r = await run('SOLANA', 'SolSUSPECT501');
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  it('returns UNKNOWN with zero confidence when no VASP is reachable', async () => {
    const r = await run('ETHEREUM', '0xnobodyhere000000000000000000000000000000');
    expect(r.classification).toBe('UNKNOWN');
    expect(r.confidence).toBe(0);
    expect(r.nearestVasp).toBeNull();
  });
});

describe('configuration', () => {
  it('thresholds drive classification', () => {
    expect(classify(80, DEFAULT_ATTRIBUTION_CONFIG.thresholds)).toBe('STRONGLY_INFERRED');
    expect(classify(80, { confirmed: 79, stronglyInferred: 60, probable: 40, possible: 20 })).toBe('CONFIRMED');
  });
  it('rejects non-monotonic thresholds', () => {
    const bad = { ...DEFAULT_ATTRIBUTION_CONFIG, thresholds: { confirmed: 50, stronglyInferred: 75, probable: 50, possible: 25 } };
    expect(attributionConfigSchema.safeParse(bad).success).toBe(false);
  });
});
