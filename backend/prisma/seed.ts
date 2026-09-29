import bcrypt from 'bcryptjs';
import { prisma } from '../src/database/client.js';
import { normalizeAddress } from '../src/blockchain/address.js';
import { DEMO_SCENARIOS } from '../src/blockchain/demo/scenarios.js';
import type { Chain } from '../src/config/networks.js';
import { DEMO_SERVICES, DEMO_SOURCE, DEMO_VASPS, DEMO_VERIFIED_AT } from '../src/vasp/demo-intel.js';
import { createCase } from '../src/cases/case.service.js';

const NETWORKS = [
  { code: 'BITCOIN', name: 'Bitcoin', nativeSymbol: 'BTC', explorerUrl: 'https://mempool.space/tx/' },
  { code: 'ETHEREUM', name: 'Ethereum', nativeSymbol: 'ETH', explorerUrl: 'https://etherscan.io/tx/' },
  { code: 'BNB', name: 'BNB Chain', nativeSymbol: 'BNB', explorerUrl: 'https://bscscan.com/tx/' },
  { code: 'TRON', name: 'Tron', nativeSymbol: 'TRX', explorerUrl: 'https://tronscan.org/#/transaction/' },
  { code: 'SOLANA', name: 'Solana', nativeSymbol: 'SOL', explorerUrl: 'https://solscan.io/tx/' },
  { code: 'POLYGON', name: 'Polygon', nativeSymbol: 'POL', explorerUrl: 'https://polygonscan.com/tx/' },
];

async function upsertUser(email: string, name: string, role: 'ADMIN' | 'INVESTIGATOR', passwordHash: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash } });
}

async function seedIntel() {
  for (const v of DEMO_VASPS) {
    const entity = await prisma.entity.upsert({
      where: { name: v.name },
      update: {},
      create: { name: v.name, type: v.type, isDemo: true, source: DEMO_SOURCE, notes: v.notes },
    });
    const vasp = await prisma.vasp.upsert({
      where: { entityId: entity.id },
      update: {},
      create: { entityId: entity.id, aliases: v.aliases, jurisdiction: v.jurisdiction },
    });
    for (const x of v.addresses) {
      const address = normalizeAddress(x.chain, x.address);
      const data = { vaspId: vasp.id, chain: x.chain, address, addressType: x.addressType, confidence: x.confidence, source: DEMO_SOURCE, lastVerified: DEMO_VERIFIED_AT };
      await prisma.vaspAddress.upsert({ where: { chain_address: { chain: x.chain, address } }, update: {}, create: data });
    }
  }
  for (const s of DEMO_SERVICES) {
    const entity = await prisma.entity.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name, type: s.type, isDemo: true, source: DEMO_SOURCE, notes: s.notes },
    });
    for (const x of s.addresses) {
      const address = normalizeAddress(x.chain, x.address);
      const data = { entityId: entity.id, chain: x.chain, address, addressType: x.addressType, label: s.name, confidence: x.confidence, source: DEMO_SOURCE, lastVerified: DEMO_VERIFIED_AT };
      await prisma.addressLabel.upsert({ where: { chain_address: { chain: x.chain, address } }, update: {}, create: data });
    }
  }
}

async function main() {
  for (const n of NETWORKS) {
    await prisma.blockchainNetwork.upsert({ where: { code: n.code }, update: n, create: n });
  }

  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD ?? 'demo-password-change-me', 12);
  await upsertUser('admin@demo.local', 'Demo Admin', 'ADMIN', passwordHash);
  const inv = await upsertUser('investigator@demo.local', 'Demo Investigator', 'INVESTIGATOR', passwordHash);
  await prisma.investigator.upsert({
    where: { userId: inv.id },
    update: {},
    create: { userId: inv.id, agency: 'DEMO Cyber Crime Cell', badgeNumber: 'DEMO-0001' },
  });

  await seedIntel();

  for (const sc of DEMO_SCENARIOS) {
    const title = `DEMO ${sc.id}: ${sc.title}`;
    if (await prisma.case.findFirst({ where: { title } })) continue;
    const c = await createCase({ title, summary: `${sc.description} (synthetic demo data)`, createdById: inv.id });
    const address = normalizeAddress(sc.chain as Chain, sc.suspect);
    const wallet = await prisma.wallet.upsert({
      where: { chain_address: { chain: sc.chain, address } },
      update: {},
      create: { chain: sc.chain, address },
    });
    await prisma.caseWallet.create({ data: { caseId: c.id, walletId: wallet.id } });
  }
}

main().finally(() => prisma.$disconnect());
