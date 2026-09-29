import { Prisma } from '../generated/prisma/client.js';
import type { Chain } from '../config/networks.js';
import { normalizeAddress } from '../blockchain/address.js';
import { getAllTransfers } from '../blockchain/wallet-lookup.js';
import type { NormalizedTransaction } from '../blockchain/types.js';
import { nodeKey, type GraphEdge, type GraphNode, type NodeKey, type TransactionGraph, type TransferFilter, type TransferSource } from './types.js';

export const MAX_HOPS_LIMIT = 6;
const FETCH_CONCURRENCY = 8;

export interface BuildGraphOptions extends TransferFilter {
  chain: Chain;
  address: string;
  maxHops: number;
  direction?: 'outbound' | 'inbound';
  /** Hard stop for runaway expansion (e.g. exchange hot wallets with millions of transfers). */
  maxNodes?: number;
  source?: TransferSource;
}

const defaultSource: TransferSource = (chain, address, { from, to }) => getAllTransfers(chain, address, { from, to });

function passes(t: NormalizedTransaction, f: TransferFilter): boolean {
  if (t.status !== 'SUCCESS') return false;
  if (f.tokens?.length && !f.tokens.includes(t.token)) return false;
  if (f.minAmount !== undefined && new Prisma.Decimal(t.amount).lt(f.minAmount)) return false;
  return true;
}

/** Breadth-first expansion from a root, following funds outbound (default) or inbound. */
export async function buildGraph(opts: BuildGraphOptions): Promise<TransactionGraph> {
  const { chain, maxHops, direction = 'outbound', maxNodes = 5000, source = defaultSource } = opts;
  if (maxHops < 0 || maxHops > MAX_HOPS_LIMIT) throw new RangeError(`maxHops must be 0..${MAX_HOPS_LIMIT}`);

  const rootAddress = normalizeAddress(chain, opts.address);
  const root = nodeKey(chain, rootAddress);
  const nodes = new Map<NodeKey, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const adjacency = new Map<NodeKey, GraphEdge[]>();
  const seen = new Set<string>();
  let truncated = false;

  const ensureNode = (address: string, depth: number): GraphNode => {
    const key = nodeKey(chain, address);
    let node = nodes.get(key);
    if (!node) {
      node = { key, chain, address, depth, inDegree: 0, outDegree: 0 };
      nodes.set(key, node);
    }
    return node;
  };

  ensureNode(rootAddress, 0);
  let frontier = [rootAddress];

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next = new Set<string>();
    for (let i = 0; i < frontier.length; i += FETCH_CONCURRENCY) {
      const batch = frontier.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(batch.map((addr) => source(chain, addr, opts)));
      batch.forEach((addr, idx) => {
        for (const t of results[idx]!) {
          const outgoing = direction === 'outbound';
          if ((outgoing ? t.from : t.to) !== addr || !passes(t, opts)) continue;
          const neighbour = outgoing ? t.to : t.from;
          if (!nodes.has(nodeKey(chain, neighbour))) {
            if (nodes.size >= maxNodes) {
              truncated = true;
              continue;
            }
            next.add(neighbour);
          }
          ensureNode(neighbour, depth + 1);
          addTransfer(t);
        }
      });
    }
    frontier = [...next];
  }

  function addTransfer(t: NormalizedTransaction) {
    const dedupeKey = `${t.from}|${t.to}|${t.token}`;
    let edge = edgeMap.get(dedupeKey);
    if (!edge) {
      edge = { from: nodeKey(chain, t.from), to: nodeKey(chain, t.to), chain, token: t.token, totalAmount: new Prisma.Decimal(0), txCount: 0, firstSeen: t.timestamp, lastSeen: t.timestamp, transfers: [] };
      edgeMap.set(dedupeKey, edge);
      const tail = direction === 'outbound' ? edge.from : edge.to;
      const out = adjacency.get(tail);
      if (out) out.push(edge);
      else adjacency.set(tail, [edge]);
      ensureNode(t.from, 0).outDegree++;
      ensureNode(t.to, 0).inDegree++;
    }
    // Re-expansion can see the same transfer twice (once from each endpoint).
    const id = `${t.chain}|${t.txHash}|${t.transferIndex}|${t.from}|${t.to}|${t.token}`;
    if (seen.has(id)) return;
    seen.add(id);
    edge.transfers.push(t);
    edge.totalAmount = edge.totalAmount.plus(t.amount);
    edge.txCount++;
    if (t.timestamp < edge.firstSeen) edge.firstSeen = t.timestamp;
    if (t.timestamp > edge.lastSeen) edge.lastSeen = t.timestamp;
  }

  const edges = [...edgeMap.values()];
  for (const e of edges) e.transfers.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.txHash.localeCompare(b.txHash));
  return { root, direction, maxHops, truncated, nodes, edges, adjacency };
}

/** JSON-safe form for the API / UI. */
export function serializeGraph(g: TransactionGraph) {
  return {
    root: g.root,
    direction: g.direction,
    maxHops: g.maxHops,
    truncated: g.truncated,
    nodes: [...g.nodes.values()],
    edges: g.edges.map(({ transfers, totalAmount, ...e }) => ({ ...e, totalAmount: totalAmount.toString(), transfers })),
  };
}
