import type { EntityType } from '../generated/prisma/client.js';
import type { Chain } from '../config/networks.js';
import { normalizeAddress } from '../blockchain/address.js';
import { prisma } from '../database/client.js';

/** What the intelligence database knows about one address. */
export interface AddressIntel {
  chain: Chain;
  address: string;
  entityId: string;
  entityName: string;
  entityType: EntityType;
  addressType: EntityType;
  /** Set when the owner is a VASP (exchange, OTC desk, ...). */
  vaspId: string | null;
  /** Reliability of the label itself, 0–100 (not a claim about a specific investigation). */
  confidence: number;
  source: string;
  lastVerified: string;
  isDemo: boolean;
}

/** Batch lookup of known addresses on one chain. Unknown addresses are simply absent. */
export async function lookupIntel(chain: Chain, addresses: string[]): Promise<Map<string, AddressIntel>> {
  const wanted = [...new Set(addresses.map((x) => normalizeAddress(chain, x)))];
  const result = new Map<string, AddressIntel>();
  if (wanted.length === 0) return result;

  const [vaspRows, labelRows] = await Promise.all([
    prisma.vaspAddress.findMany({ where: { chain, address: { in: wanted } }, include: { vasp: { include: { entity: true } } } }),
    prisma.addressLabel.findMany({ where: { chain, address: { in: wanted } }, include: { entity: true } }),
  ]);

  for (const r of labelRows) {
    result.set(r.address, {
      chain, address: r.address, entityId: r.entityId, entityName: r.entity.name, entityType: r.entity.type, addressType: r.addressType,
      vaspId: null, confidence: r.confidence, source: r.source, lastVerified: r.lastVerified.toISOString(), isDemo: r.entity.isDemo,
    });
  }
  for (const r of vaspRows) {
    result.set(r.address, {
      chain, address: r.address, entityId: r.vasp.entityId, entityName: r.vasp.entity.name, entityType: r.vasp.entity.type, addressType: r.addressType,
      vaspId: r.vaspId, confidence: r.confidence, source: r.source, lastVerified: r.lastVerified.toISOString(), isDemo: r.vasp.entity.isDemo,
    });
  }
  return result;
}

export function listVasps() {
  return prisma.vasp.findMany({
    orderBy: { entity: { name: 'asc' } },
    include: { entity: true, _count: { select: { addresses: true } } },
  });
}
