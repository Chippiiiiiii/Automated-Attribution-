import type { Prisma } from '../generated/prisma/client.js';
import type { Chain } from '../config/networks.js';
import type { NormalizedTransaction } from '../blockchain/types.js';

/** Node identity is `${chain}:${address}` so multi-chain graphs (Stage 8) never collide. */
export type NodeKey = string;

export const nodeKey = (chain: Chain, address: string): NodeKey => `${chain}:${address}`;

export interface GraphNode {
  key: NodeKey;
  chain: Chain;
  address: string;
  /** Shortest topological distance from the root (ignores timing). */
  depth: number;
  inDegree: number;
  outDegree: number;
}

/** All transfers of one token from one address to another. */
export interface GraphEdge {
  from: NodeKey;
  to: NodeKey;
  chain: Chain;
  token: string;
  totalAmount: Prisma.Decimal;
  txCount: number;
  firstSeen: string;
  lastSeen: string;
  transfers: NormalizedTransaction[];
}

export interface TransactionGraph {
  root: NodeKey;
  direction: 'outbound' | 'inbound';
  maxHops: number;
  /** True if node/transfer limits stopped the expansion early. */
  truncated: boolean;
  nodes: Map<NodeKey, GraphNode>;
  edges: GraphEdge[];
  /** Outgoing edges per node in traversal direction. */
  adjacency: Map<NodeKey, GraphEdge[]>;
}

export interface TransferFilter {
  from?: Date;
  to?: Date;
  /** Minimum single-transfer amount, in units of the transfer's own token. */
  minAmount?: string;
  tokens?: string[];
}

export type TransferSource = (chain: Chain, address: string, filter: TransferFilter) => Promise<NormalizedTransaction[]>;
