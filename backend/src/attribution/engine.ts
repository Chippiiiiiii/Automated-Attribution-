import { Prisma } from '../generated/prisma/client.js';
import { normalizeAddress } from '../blockchain/address.js';
import { buildGraph } from '../graph/build-graph.js';
import { findPaths, type FundPath } from '../graph/paths.js';
import { nodeKey, type NodeKey, type TransactionGraph, type TransferSource } from '../graph/types.js';
import { lookupIntel, type AddressIntel } from '../vasp/intel.service.js';
import { DEFAULT_ATTRIBUTION_CONFIG, type AttributionConfig } from './config.js';
import { classify, scoreCandidate } from './scoring.js';
import { ATTRIBUTION_DISCLAIMER, type AttributionCandidate, type AttributionParams, type AttributionResult, type PathHopView } from './types.js';

export interface EngineDeps {
  config?: AttributionConfig;
  source?: TransferSource;
  intel?: typeof lookupIntel;
}

const addressOf = (key: NodeKey) => key.slice(key.indexOf(':') + 1);
const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
const OBFUSCATORS = new Set(['MIXER', 'TUMBLER']);

/**
 * Finds VASPs that funds from the suspect wallet reach, ranks them with the transparent scoring model,
 * and explains the choice. It never asserts identity; see ATTRIBUTION_DISCLAIMER.
 */
export async function attribute(params: AttributionParams, deps: EngineDeps = {}): Promise<AttributionResult> {
  const config = deps.config ?? DEFAULT_ATTRIBUTION_CONFIG;
  const intelOf = deps.intel ?? lookupIntel;
  const { chain, maxHops, timeRange } = params;
  const suspect = normalizeAddress(chain, params.walletAddress);

  const graph = await buildGraph({
    chain, address: suspect, maxHops, ...timeRange, ...(deps.source ? { source: deps.source } : {}),
  });
  const intel = await intelOf(chain, [...graph.nodes.values()].map((n) => n.address));
  const intelFor = (key: NodeKey): AddressIntel | undefined => intel.get(addressOf(key));

  const paths = findPaths(graph, { isTarget: (k) => intelFor(k)?.vaspId != null });
  const byEntity = new Map<string, FundPath[]>();
  for (const p of paths) {
    const entityId = intelFor(p.nodes.at(-1)!)!.entityId;
    byEntity.set(entityId, [...(byEntity.get(entityId) ?? []), p]);
  }

  const candidates = [...byEntity.values()]
    .map((vaspPaths) => buildCandidate(graph, vaspPaths, intelFor, config))
    .sort((a, b) => b.score - a.score || a.hops - b.hops || new Prisma.Decimal(b.amount).comparedTo(a.amount));

  const best = candidates[0] ?? null;
  return {
    suspectWallet: { chain, address: suspect },
    nearestVasp: best,
    confidence: best?.confidence ?? 0,
    classification: best?.classification ?? 'UNKNOWN',
    distance: best?.hops ?? null,
    evidence: best?.evidence ?? [],
    transactionPath: best?.path.hops ?? [],
    intermediaryAddresses: best?.intermediaryAddresses ?? [],
    candidates,
    reasoning: explainSelection(candidates, maxHops, graph.truncated),
    parameters: { maxHops, timeRange: { from: timeRange?.from?.toISOString() ?? null, to: timeRange?.to?.toISOString() ?? null } },
    graph: { nodes: graph.nodes.size, edges: graph.edges.length, truncated: graph.truncated },
    disclaimer: ATTRIBUTION_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

function buildCandidate(
  graph: TransactionGraph,
  vaspPaths: FundPath[],
  intelFor: (k: NodeKey) => AddressIntel | undefined,
  config: AttributionConfig,
): AttributionCandidate {
  // Best path = shortest, then largest amount (findPaths already sorts this way).
  const path = vaspPaths[0]!;
  const terminalKey = path.nodes.at(-1)!;
  const terminal = intelFor(terminalKey)!;
  const firstHopToken = path.hops[0]!.token;

  const rootOutflow = (graph.adjacency.get(graph.root) ?? [])
    .filter((e) => e.token === firstHopToken)
    .reduce((sum, e) => sum.plus(e.totalAmount), new Prisma.Decimal(0));
  const amountShare = rootOutflow.isZero() ? 0 : Prisma.Decimal.min(path.bottleneckAmount.div(rootOutflow), 1).toNumber();
  const continuity = path.hops[0]!.amount.isZero() ? 0 : Prisma.Decimal.min(path.bottleneckAmount.div(path.hops[0]!.amount), 1).toNumber();

  const interactions = vaspPaths.reduce((n, p) => n + p.hops.at(-1)!.transfers.length, 0);
  const intermediates = path.nodes.slice(1, -1);
  const scored = scoreCandidate(
    {
      hops: path.distance,
      labelConfidence: terminal.confidence,
      continuity,
      interactions,
      hotWalletRelation: terminal.addressType === 'HOT_WALLET' || reachesHotWallet(graph, terminalKey, terminal.entityId, intelFor),
      spanHours: hoursBetween(path.startedAt, path.arrivedAt),
      amountShare,
      mixerOnPath: intermediates.some((k) => OBFUSCATORS.has(intelFor(k)?.entityType ?? '')),
    },
    config,
  );
  const classification = classify(scored.confidence, config.thresholds);
  const lastInteraction = vaspPaths.reduce((latest, p) => (p.hops.at(-1)!.transfers.at(-1)!.timestamp > latest ? p.hops.at(-1)!.transfers.at(-1)!.timestamp : latest), '');

  return {
    vasp: { vaspId: terminal.vaspId!, entityId: terminal.entityId, name: terminal.entityName, type: terminal.entityType, isDemo: terminal.isDemo },
    terminalAddress: addressOf(terminalKey),
    terminalAddressType: terminal.addressType,
    hops: path.distance,
    amount: path.bottleneckAmount.toString(),
    token: firstHopToken,
    timestamp: path.arrivedAt,
    lastInteraction,
    interactions,
    path: { nodes: path.nodes.map(addressOf), hops: path.hops.map((h) => hopView(h, intelFor)) },
    intermediaryAddresses: intermediates.map(addressOf),
    evidence: scored.factors,
    score: scored.score,
    confidence: scored.confidence,
    classification,
    explanation:
      `${terminal.entityName} is ${path.distance} hop(s) from the suspect wallet, reached via ${intermediates.length} intermediary address(es); ` +
      `${amountShare > 0 ? `${Math.round(amountShare * 100)}% of the suspect's outflow` : 'a share of the funds'} follows this path. ` +
      `Analytical confidence ${scored.confidence}/100 (${classification.replace('_', ' ').toLowerCase()}); this is an inference, not proof of ownership.`,
  };
}

function reachesHotWallet(graph: TransactionGraph, start: NodeKey, entityId: string, intelFor: (k: NodeKey) => AddressIntel | undefined): boolean {
  const seen = new Set<NodeKey>([start]);
  const queue = [start];
  while (queue.length) {
    for (const edge of graph.adjacency.get(queue.shift()!) ?? []) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      const i = intelFor(edge.to);
      if (i?.entityId === entityId && i.addressType === 'HOT_WALLET') return true;
      queue.push(edge.to);
    }
  }
  return false;
}

export function hopView(h: FundPath['hops'][number], intelFor: (k: NodeKey) => AddressIntel | undefined): PathHopView {
  return {
    from: addressOf(h.from),
    to: addressOf(h.to),
    fromLabel: intelFor(h.from)?.entityName ?? null,
    toLabel: intelFor(h.to)?.entityName ?? null,
    token: h.token,
    amount: h.amount.toString(),
    txCount: h.transfers.length,
    firstTimestamp: h.firstTimestamp,
    lastTimestamp: h.transfers.at(-1)!.timestamp,
    txHashes: h.transfers.map((t) => t.txHash),
  };
}

function explainSelection(candidates: AttributionCandidate[], maxHops: number, truncated: boolean): string[] {
  if (candidates.length === 0) {
    return [
      `No VASP-labelled address was reached within ${maxHops} hop(s) of the suspect wallet.`,
      'This does not mean funds did not reach a VASP: the label database is incomplete and the search window is limited.',
    ];
  }
  const [best, ...others] = candidates as [AttributionCandidate, ...AttributionCandidate[]];
  const notes = [`Selected ${best.vasp.name}: highest-scoring candidate (${best.confidence}/100) of ${candidates.length}.`];
  const closest = candidates.reduce((a, b) => (b.hops < a.hops ? b : a));
  if (closest !== best) {
    notes.push(
      `${closest.vasp.name} is closer (${closest.hops} hop(s) vs ${best.hops}) but scored ${closest.confidence}/100: ` +
        'hop distance alone is not treated as evidence; label quality, amount share and path continuity also count.',
    );
  }
  const runnerUp = others[0];
  if (runnerUp && best.confidence - runnerUp.confidence < 10) {
    notes.push(`Runner-up ${runnerUp.vasp.name} is within 10 points (${runnerUp.confidence}/100); treat the ranking as indicative and review both.`);
  }
  if (best.classification === 'LOW_CONFIDENCE') notes.push('Best candidate is low confidence and should not be relied upon.');
  if (truncated) notes.push('The graph hit its size limit, so some paths may be missing.');
  return notes;
}
