import { prisma } from '../database/client.js';
import { normalizeAddress } from '../blockchain/address.js';
import { getAllTransfers } from '../blockchain/wallet-lookup.js';
import { isSupportedChain } from '../blockchain/registry.js';
import type { NormalizedTransaction } from '../blockchain/types.js';
import type { Chain } from '../config/networks.js';
import type { TransactionGraph } from '../graph/types.js';
import type { BridgeLink } from '../attribution/types.js';
import { lookupIntel } from '../vasp/intel.service.js';

const view = (t: NormalizedTransaction) => ({ txHash: t.txHash, from: t.from, to: t.to, amount: t.amount, token: t.token, timestamp: t.timestamp });

/**
 * Finds bridge deposits in a graph (transfers whose chainDetails carry a bridgeId and a known destination chain)
 * and matches each to its destination-side release, by bridge id or by the recorded source tx hash.
 */
export async function findBridgeLinks(graph: TransactionGraph, chain: Chain): Promise<BridgeLink[]> {
  const deposits = graph.edges.flatMap((e) => e.transfers).filter((t) => typeof t.chainDetails?.bridgeId === 'string' && typeof t.chainDetails?.destChain === 'string' && isSupportedChain(t.chainDetails.destChain));
  const links: BridgeLink[] = [];
  for (const dep of deposits) {
    const { bridgeId, destChain } = dep.chainDetails as { bridgeId: string; destChain: Chain };
    const bridgeIntel = (await lookupIntel(chain, [dep.to])).get(normalizeAddress(chain, dep.to));
    const destAddresses = bridgeIntel
      ? await prisma.addressLabel.findMany({ where: { chain: destChain, entityId: bridgeIntel.entityId } })
      : [];

    let dest: NormalizedTransaction | undefined;
    let matchedBy: BridgeLink['matchedBy'] = null;
    for (const a of destAddresses) {
      const releases = (await getAllTransfers(destChain, a.address)).filter((t) => t.from === a.address && t.timestamp >= dep.timestamp);
      dest = releases.find((t) => t.chainDetails?.srcTxHash === dep.txHash) ?? releases.find((t) => t.chainDetails?.bridgeId === bridgeId);
      if (dest) {
        matchedBy = dest.chainDetails?.srcTxHash === dep.txHash ? 'srcTxHash' : 'bridgeId';
        break;
      }
    }
    links.push({
      bridgeId,
      bridge: bridgeIntel?.entityName ?? null,
      sourceChain: chain,
      destChain,
      source: view(dep),
      dest: dest ? view(dest) : null,
      depositHops: graph.nodes.get(`${chain}:${normalizeAddress(chain, dep.to)}`)?.depth ?? 1,
      matchedBy,
    });
  }
  return links;
}
