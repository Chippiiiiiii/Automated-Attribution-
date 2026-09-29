import { Prisma } from '../generated/prisma/client.js';
import { normalizeAddress } from '../blockchain/address.js';
import type { Chain } from '../config/networks.js';
import { buildGraph } from '../graph/build-graph.js';
import { hopDistance } from '../graph/paths.js';
import type { NodeKey, TransactionGraph, TransferSource } from '../graph/types.js';
import { lookupIntel } from '../vasp/intel.service.js';
import { DEFAULT_RISK_CONFIG, type RiskConfig } from './config.js';
import { assessRisk, type RiskAssessment, type RiskFacts } from './scoring.js';

export interface RiskDeps {
  config?: RiskConfig;
  source?: TransferSource;
}

export interface RiskReport extends RiskAssessment {
  wallet: { chain: Chain; address: string };
  maxHops: number;
  truncated: boolean;
  disclaimer: string;
  generatedAt: string;
}

export const RISK_DISCLAIMER = 'Risk indicators are heuristics that flag patterns for review; they are not evidence of wrongdoing.';

const addressOf = (k: NodeKey) => k.slice(k.indexOf(':') + 1);
const BRIDGE_TYPES = new Set(['BRIDGE', 'CROSS_CHAIN_SERVICE']);

export async function assessWallet(chain: Chain, walletAddress: string, maxHops: number, deps: RiskDeps = {}): Promise<RiskReport> {
  const config = deps.config ?? DEFAULT_RISK_CONFIG;
  const address = normalizeAddress(chain, walletAddress);
  const src = deps.source ? { source: deps.source } : {};
  const [out, inn] = await Promise.all([
    buildGraph({ chain, address, maxHops, ...src }),
    buildGraph({ chain, address, maxHops: 1, direction: 'inbound', ...src }),
  ]);
  const intel = await lookupIntel(chain, [...out.nodes.values(), ...inn.nodes.values()].map((n) => n.address));
  const typeOf = (k: NodeKey) => intel.get(addressOf(k))?.entityType;

  const facts = gatherFacts(out, inn, typeOf, config);
  return {
    ...assessRisk(facts, config),
    wallet: { chain, address },
    maxHops,
    truncated: out.truncated || inn.truncated,
    disclaimer: RISK_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

function gatherFacts(out: TransactionGraph, inn: TransactionGraph, typeOf: (k: NodeKey) => string | undefined, config: RiskConfig): RiskFacts {
  const isType = (types: string[]) => (k: NodeKey) => k !== out.root && types.includes(typeOf(k) ?? '');
  const inboundMixer = [...inn.nodes.keys()].some(isType(['MIXER', 'TUMBLER']));

  const outEdges = out.adjacency.get(out.root) ?? [];
  const inEdges = inn.adjacency.get(inn.root) ?? [];
  const outTransfers = outEdges.flatMap((e) => e.transfers).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const inTransfers = inEdges.flatMap((e) => e.transfers).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const bridgeNode = [...out.nodes.keys(), ...inn.nodes.keys()].find(isType([...BRIDGE_TYPES]));
  const bridgeId = [...outTransfers, ...inTransfers].map((t) => t.chainDetails?.bridgeId).find((x) => typeof x === 'string');

  // Pass-through: compare inflow and outflow in the token of the first outbound transfer.
  const token = outTransfers[0]?.token;
  const sum = (ts: typeof outTransfers) => ts.filter((t) => t.token === token).reduce((s, t) => s.plus(t.amount), new Prisma.Decimal(0));
  const received = sum(inTransfers);
  const forwardedShare = received.isZero() ? 0 : Prisma.Decimal.min(sum(outTransfers).div(received), 1).toNumber();
  const firstIn = inTransfers[0];
  const firstOut = outTransfers[0];

  return {
    mixerHops: hopDistance(out, isType(['MIXER', 'TUMBLER'])) ?? (inboundMixer ? 1 : null),
    bridgeSeen: bridgeNode !== undefined || bridgeId !== undefined,
    bridgeDetail: bridgeId ? `Bridge transfer ${String(bridgeId)} observed.` : bridgeNode ? `Bridge-labelled address ${addressOf(bridgeNode)} in the transaction neighbourhood.` : null,
    otcHops: hopDistance(out, isType(['OTC_SERVICE'])),
    holdHours: firstIn && firstOut ? (Date.parse(firstOut.timestamp) - Date.parse(firstIn.timestamp)) / 3_600_000 : null,
    forwardedShare,
    distinctRecipients: new Set(outEdges.map((e) => e.to)).size,
    unlabeledChain: longestUnlabeledChain(out, typeOf),
    similarTransfers: largestSimilarGroup(outTransfers.map((t) => `${t.token}|${t.amount}`), config.params.structuringTolerance),
  };
}

function longestUnlabeledChain(g: TransactionGraph, typeOf: (k: NodeKey) => string | undefined): number {
  const best = new Map<NodeKey, number>([[g.root, 0]]);
  const queue: NodeKey[] = [g.root];
  let max = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of g.adjacency.get(cur) ?? []) {
      if (typeOf(e.to) !== undefined) continue;
      const len = best.get(cur)! + 1;
      if (len > (best.get(e.to) ?? 0) && len <= g.maxHops) {
        best.set(e.to, len);
        max = Math.max(max, len);
        queue.push(e.to);
      }
    }
  }
  return max;
}

/** Largest number of same-token amounts within `tolerance` (relative) of one another. */
function largestSimilarGroup(items: string[], tolerance: number): number {
  const byToken = new Map<string, number[]>();
  for (const it of items) {
    const [token, amount] = it.split('|') as [string, string];
    byToken.set(token, [...(byToken.get(token) ?? []), Number(amount)].sort((a, b) => a - b));
  }
  let best = 0;
  for (const amounts of byToken.values()) {
    for (let i = 0, j = 0; i < amounts.length; i++) {
      while (amounts[i]! > amounts[j]! * (1 + tolerance)) j++;
      best = Math.max(best, i - j + 1);
    }
  }
  return best;
}
