import type { Request, Response } from 'express';
import { z } from 'zod';
import { isPlausibleAddress } from '../blockchain/address.js';
import { SUPPORTED_CHAINS } from '../config/networks.js';
import { getAllTransfers, lookupWallet } from '../blockchain/wallet-lookup.js';

const paramsSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS),
  address: z.string().refine(isPlausibleAddress, 'Invalid address'),
});
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function summary(req: Request, res: Response) {
  const { chain, address } = paramsSchema.parse(req.params);
  res.json(await lookupWallet(chain, address));
}

export async function transactions(req: Request, res: Response) {
  const { chain, address } = paramsSchema.parse(req.params);
  res.json(await getAllTransfers(chain, address, querySchema.parse(req.query)));
}
