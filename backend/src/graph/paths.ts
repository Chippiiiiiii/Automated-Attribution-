import { Prisma } from '../generated/prisma/client.js';
import type { NormalizedTransaction } from '../blockchain/types.js';
import type { GraphEdge, NodeKey, TransactionGraph } from './types.js';

export interface PathHop {
  from: NodeKey;
  to: NodeKey;
  token: string;
  /** Transfers on this hop that could carry the funds (at or after the previous hop). */
  transfers: NormalizedTransaction[];
  amount: Prisma.Decimal;
  firstTimestamp: string;
}

export interface FundPath {
  /** Node keys from root to target inclusive. */
  nodes: NodeKey[];
  hops: PathHop[];
  distance: number;
  /** Smallest hop amount: the most that could have travelled the whole path. */
  bottleneckAmount: Prisma.Decimal;
  startedAt: string;
  arrivedAt: string;
}

export interface FindPathsOptions {
  /** Stop at nodes matching this; the path is reported and not extended past it. */
  isTarget: (key: NodeKey) => boolean;
  maxHops?: number;
  /** Cap on reported paths, so dense graphs stay bounded. */
  maxPaths?: number;
}

/**
 * Enumerates simple, time-consistent fund paths from the graph root to target nodes.
 * A hop is only usable with transfers at or after the moment funds reached its tail,
 * so a path never spends money before it arrives. Results are shortest-first, then largest amount.
 */
export function findPaths(graph: TransactionGraph, { isTarget, maxHops = graph.maxHops, maxPaths = 200 }: FindPathsOptions): FundPath[] {
  if (graph.direction !== 'outbound') throw new Error('findPaths supports outbound graphs only');
  const found: FundPath[] = [];
  const onPath = new Set<NodeKey>([graph.root]);

  const walk = (node: NodeKey, arrival: string, hops: PathHop[], nodes: NodeKey[]) => {
    if (found.length >= maxPaths || hops.length >= maxHops) return;
    for (const edge of graph.adjacency.get(node) ?? []) {
      const nextKey = edge.to;
      if (onPath.has(nextKey)) continue;
      const usable = edge.transfers.filter((t) => t.timestamp >= arrival);
      if (usable.length === 0) continue;

      const hop = toHop(edge, usable);
      const nextHops = [...hops, hop];
      const nextNodes = [...nodes, nextKey];
      if (isTarget(nextKey)) {
        found.push(toPath(nextNodes, nextHops));
        if (found.length >= maxPaths) return;
        continue;
      }
      onPath.add(nextKey);
      walk(nextKey, hop.firstTimestamp, nextHops, nextNodes);
      onPath.delete(nextKey);
    }
  };

  walk(graph.root, '', [], [graph.root]);
  return found.sort((a, b) => a.distance - b.distance || b.bottleneckAmount.comparedTo(a.bottleneckAmount));
}

/** Shortest time-consistent hop count to any target, or null if unreachable. */
export function hopDistance(graph: TransactionGraph, isTarget: (key: NodeKey) => boolean): number | null {
  return findPaths(graph, { isTarget })[0]?.distance ?? null;
}

function toHop(edge: GraphEdge, transfers: NormalizedTransaction[]): PathHop {
  return {
    from: edge.from,
    to: edge.to,
    token: edge.token,
    transfers,
    amount: transfers.reduce((sum, t) => sum.plus(t.amount), new Prisma.Decimal(0)),
    firstTimestamp: transfers[0]!.timestamp,
  };
}

function toPath(nodes: NodeKey[], hops: PathHop[]): FundPath {
  return {
    nodes,
    hops,
    distance: hops.length,
    bottleneckAmount: hops.reduce((min, h) => (h.amount.lt(min) ? h.amount : min), hops[0]!.amount),
    startedAt: hops[0]!.firstTimestamp,
    arrivedAt: hops.at(-1)!.firstTimestamp,
  };
}
