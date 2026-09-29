import { buildGraph } from '../graph/build-graph.js';
import { findPaths } from '../graph/paths.js';
import { nodeKey } from '../graph/types.js';
import { normalizeAddress } from '../blockchain/address.js';
import { isSupportedChain } from '../blockchain/registry.js';
import type { Chain } from '../config/networks.js';
import { attribute, hopView, type EngineDeps } from '../attribution/engine.js';
import { DEFAULT_ATTRIBUTION_CONFIG, type AttributionConfig } from '../attribution/config.js';
import { classify } from '../attribution/scoring.js';
import type { AttributionParams, AttributionResult, BridgeLink, EvidenceFactor, PathHopView } from '../attribution/types.js';
import { findBridgeLinks } from './bridge.js';

const MAX_CROSSINGS = 2;

/**
 * Re-scores a destination-chain candidate as if it were reached through a bridge: proximity is recomputed on the
 * total hop count (crossing included) and the bridge penalty is applied, so the evidence table adds up to the result.
 */
function throughBridge(evidence: EvidenceFactor[], totalHops: number, link: BridgeLink, config: AttributionConfig) {
  const adjusted = evidence.map((f) =>
    f.factor === 'PROXIMITY'
      ? {
          ...f,
          points: Math.max(0, f.maxPoints - config.proximityStepPerHop * (totalHops - 1)),
          detail: `${totalHops} hops to a VASP-labelled address, including the bridge crossing`,
        }
      : f,
  );
  const withPenalty: EvidenceFactor[] = [
    ...adjusted,
    { factor: 'bridgeCrossing', points: -config.penalties.bridgeCrossing, maxPoints: 0, detail: `Funds crossed ${link.sourceChain}→${link.destChain} via ${link.bridge ?? 'a bridge'} (${link.bridgeId}); cross-chain matches are weaker evidence.` },
  ];
  const maxPossible = Object.values(config.weights).reduce((a, b) => a + b, 0);
  const score = Math.round(withPenalty.reduce((n, f) => n + f.points, 0) * 100) / 100;
  const confidence = Math.round(Math.min(100, Math.max(0, (score / maxPossible) * 100)));
  return { evidence: withPenalty, score, confidence, classification: classify(confidence, config.thresholds) };
}

/**
 * Attribution that follows funds across bridges. Runs the single-chain engine on the origin chain, and again on the
 * destination chain of every matched bridge transfer; returns whichever result scores best, with the bridge crossing
 * shown as its own hop and penalised.
 */
export async function attributeAcrossChains(params: AttributionParams, deps: EngineDeps = {}, crossings = 0): Promise<AttributionResult> {
  const origin = await attribute(params, deps);
  if (crossings >= MAX_CROSSINGS) return origin;
  const config = deps.config ?? DEFAULT_ATTRIBUTION_CONFIG;

  const suspect = normalizeAddress(params.chain, params.walletAddress);
  const graph = await buildGraph({ chain: params.chain, address: suspect, maxHops: params.maxHops, ...params.timeRange, ...(deps.source ? { source: deps.source } : {}) });
  const links = (await findBridgeLinks(graph, params.chain)).filter((l) => l.dest && l.depositHops < params.maxHops);
  if (links.length === 0) return origin;

  let best = origin;

  for (const link of links) {
    const dest = link.dest!;
    if (!isSupportedChain(link.destChain)) continue;
    const depositKey = nodeKey(params.chain, normalizeAddress(params.chain, link.source.to));
    const toDeposit = findPaths(graph, { isTarget: (k) => k === depositKey })[0];
    if (!toDeposit) continue;

    const onward = await attributeAcrossChains(
      { chain: link.destChain as Chain, walletAddress: dest.to, maxHops: Math.max(1, params.maxHops - link.depositHops - 1), timeRange: { from: new Date(dest.timestamp) } },
      deps,
      crossings + 1,
    );
    if (!onward.nearestVasp) continue;

    const bridgeHop: PathHopView = {
      chain: link.destChain, bridgeId: link.bridgeId, from: link.source.to, to: dest.to, fromLabel: link.bridge, toLabel: null,
      token: dest.token, amount: dest.amount, txCount: 1, firstTimestamp: dest.timestamp, lastTimestamp: dest.timestamp,
      txHashes: [link.source.txHash, dest.txHash],
    };
    const head = toDeposit.hops.map((h) => ({ ...hopView(h, () => undefined), chain: params.chain }));
    const tail = onward.transactionPath.map((h) => ({ chain: link.destChain, ...h }));
    const offset = head.length + 1;
    const hops = offset + onward.transactionPath.length;
    const rescored = throughBridge(onward.evidence, hops, link, config);
    if (rescored.confidence <= best.confidence) continue;
    const candidates = onward.candidates.map((c) => {
      const r = throughBridge(c.evidence, c.hops + offset, link, config);
      return { ...c, hops: c.hops + offset, ...r };
    });

    best = {
      ...onward,
      suspectWallet: origin.suspectWallet,
      confidence: rescored.confidence,
      classification: rescored.classification,
      distance: hops,
      evidence: rescored.evidence,
      transactionPath: [...head, bridgeHop, ...tail],
      intermediaryAddresses: [...head.map((h) => h.to), dest.to, ...onward.intermediaryAddresses],
      candidates: [...candidates, ...origin.candidates].sort((x, y) => y.confidence - x.confidence),
      reasoning: [
        `Funds leave ${link.sourceChain} through ${link.bridge ?? 'a bridge'} (${link.bridgeId}) and re-appear on ${link.destChain}; attribution continues there.`,
        `Selected ${onward.nearestVasp.vasp.name} at ${hops} hop(s) with confidence ${rescored.confidence}/100 after the bridge-crossing penalty.`,
        ...onward.reasoning.filter((r) => !r.startsWith('Selected ')),
        ...(origin.nearestVasp ? [`A closer same-chain candidate (${origin.nearestVasp.vasp.name}, ${origin.confidence}/100) scored lower than the cross-chain path.`] : []),
      ],
      parameters: origin.parameters,
      graph: origin.graph,
      bridgeLinks: [link, ...(onward.bridgeLinks ?? [])],
    };
  }
  if (best === origin && links.length) return { ...origin, bridgeLinks: links, reasoning: [...origin.reasoning, 'Bridge transfers were found but did not yield a stronger attribution.'] };
  return best;
}

export type { BridgeLink };
