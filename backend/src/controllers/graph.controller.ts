import type { Request, Response } from 'express';
import { z } from 'zod';
import { isPlausibleAddress } from '../blockchain/address.js';
import { SUPPORTED_CHAINS } from '../config/networks.js';
import { buildGraph, MAX_HOPS_LIMIT, serializeGraph } from '../graph/build-graph.js';
import { lookupIntel } from '../vasp/intel.service.js';
import { findBridgeLinks } from '../crosschain/bridge.js';

const EDGE_SAMPLE = 5;

const paramsSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS),
  address: z.string().refine(isPlausibleAddress, 'Invalid address'),
});
const querySchema = z.object({
  maxHops: z.coerce.number().int().min(1).max(MAX_HOPS_LIMIT).default(3),
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  minAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  token: z.string().min(1).max(20).optional(),
});

export async function get(req: Request, res: Response) {
  const { chain, address } = paramsSchema.parse(req.params);
  const { token, ...query } = querySchema.parse(req.query);
  const graph = await buildGraph({ chain, address, ...query, ...(token ? { tokens: [token] } : {}) });
  const intel = await lookupIntel(chain, [...graph.nodes.values()].map((n) => n.address));
  const serialized = serializeGraph(graph);
  res.json({
    ...serialized,
    // Per-edge transfer lists can hold 100k rows; the graph view needs the aggregate and a sample only.
    edges: serialized.edges.map(({ transfers, ...e }) => ({ ...e, transfers: transfers.slice(0, EDGE_SAMPLE) })),
    nodes: serialized.nodes.map((n) => {
      const i = intel.get(n.address);
      return { ...n, intel: i ? { name: i.entityName, type: i.entityType, addressType: i.addressType, isVasp: i.vaspId !== null, confidence: i.confidence, isDemo: i.isDemo } : null };
    }),
    bridgeLinks: await findBridgeLinks(graph, chain),
  });
}
