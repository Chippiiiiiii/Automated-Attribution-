import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/client.js';
import { DEMO_SERVICES, DEMO_VASPS } from './demo-intel.js';
import { listVasps, lookupIntel } from './intel.service.js';

afterAll(() => prisma.$disconnect());

describe('VASP intelligence database', () => {
  it('labels a known deposit address with its VASP', async () => {
    const intel = (await lookupIntel('ETHEREUM', ['0xDEPOSIT001'])).get('0xdeposit001');
    expect(intel).toMatchObject({ entityName: 'Demo Exchange', entityType: 'EXCHANGE', addressType: 'DEPOSIT_ADDRESS', confidence: 90, isDemo: true });
    expect(intel!.vaspId).toBeTruthy();
  });

  it('labels non-VASP services without a vaspId', async () => {
    const intel = (await lookupIntel('TRON', ['TMIXER301'])).get('TMIXER301');
    expect(intel).toMatchObject({ entityType: 'MIXER', vaspId: null });
  });

  it('omits unknown addresses and keeps chains separate', async () => {
    expect((await lookupIntel('ETHEREUM', ['0xNOBODY'])).size).toBe(0);
    expect((await lookupIntel('POLYGON', ['0xDEPOSIT001'])).size).toBe(0);
    expect((await lookupIntel('ETHEREUM', [])).size).toBe(0);
  });

  it('is case-insensitive for EVM chains only', async () => {
    expect((await lookupIntel('ETHEREUM', ['0xdeposit001'])).size).toBe(1);
    expect((await lookupIntel('SOLANA', ['solotc501'])).size).toBe(0);
    expect((await lookupIntel('SOLANA', ['SolOTC501'])).size).toBe(1);
  });

  it('seeds every demo entity as DEMO with a stated source and no real-sounding names', async () => {
    const entities = await prisma.entity.findMany();
    expect(entities.length).toBe(DEMO_VASPS.length + DEMO_SERVICES.length);
    for (const e of entities) {
      expect(e.isDemo).toBe(true);
      expect(e.source).toMatch(/DEMO/);
      expect(e.name).toMatch(/^Demo /);
    }
  });

  it('lists VASPs with alias and address counts', async () => {
    const vasps = await listVasps();
    expect(vasps).toHaveLength(DEMO_VASPS.length);
    const beta = vasps.find((v) => v.entity.name === 'Demo Exchange Beta')!;
    expect(beta.aliases).toEqual(['DEMO-BETA']);
    expect(beta._count.addresses).toBe(2);
  });
});
