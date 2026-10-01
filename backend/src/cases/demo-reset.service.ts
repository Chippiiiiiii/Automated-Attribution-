import { prisma } from '../database/client.js';
import { normalizeAddress } from '../blockchain/address.js';
import { DEMO_SCENARIOS, type DemoScenario } from '../blockchain/demo/scenarios.js';
import type { Chain } from '../config/networks.js';
import { recordAudit } from '../services/audit.service.js';

/** Title that identifies a seeded demo case (shared with the seed script). */
export const demoCaseTitle = (sc: Pick<DemoScenario, 'id' | 'title'>) => `DEMO ${sc.id}: ${sc.title}`;

/** Admin-editable config documents that a demo reset returns to their defaults. */
const DEMO_CONFIG_KEYS = ['attribution', 'risk'];

/**
 * Returns every seeded demo case to its freshly seeded state: results, notes, reports and
 * SAHYOG drafts are removed, wallets go back to the scenario's suspect, status to OPEN, and
 * admin scoring config to defaults. Audit entries are append-only and are kept; the reset
 * itself is audited. Cases created by users are not touched.
 */
export async function resetDemoData(userId: string) {
  return prisma.$transaction(async (tx) => {
    const reset: string[] = [];
    for (const sc of DEMO_SCENARIOS) {
      const c = await tx.case.findFirst({ where: { title: demoCaseTitle(sc) } });
      if (!c) continue;
      const where = { caseId: c.id };
      await tx.attributionResult.deleteMany({ where });
      await tx.riskScore.deleteMany({ where });
      await tx.investigationReport.deleteMany({ where });
      await tx.sahyogRequest.deleteMany({ where });
      await tx.caseNote.deleteMany({ where });
      await tx.caseWallet.deleteMany({ where });
      const address = normalizeAddress(sc.chain as Chain, sc.suspect);
      const wallet = await tx.wallet.upsert({
        where: { chain_address: { chain: sc.chain, address } },
        update: {},
        create: { chain: sc.chain, address },
      });
      await tx.caseWallet.create({ data: { caseId: c.id, walletId: wallet.id } });
      await tx.case.update({ where: { id: c.id }, data: { status: 'OPEN' } });
      await recordAudit({ action: 'DEMO_RESET', userId, caseId: c.id, target: c.caseNumber ?? undefined }, tx);
      reset.push(c.caseNumber ?? c.id);
    }
    await tx.appConfig.deleteMany({ where: { key: { in: DEMO_CONFIG_KEYS } } });
    await recordAudit({ action: 'DEMO_RESET', userId, metadata: { cases: reset, configReset: DEMO_CONFIG_KEYS } }, tx);
    return { cases: reset, configReset: DEMO_CONFIG_KEYS };
  });
}
