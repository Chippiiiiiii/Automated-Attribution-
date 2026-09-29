import type { Request, Response } from 'express';
import { z } from 'zod';
import { isPlausibleAddress, normalizeAddress } from '../blockchain/address.js';
import { SUPPORTED_CHAINS } from '../config/networks.js';
import { HttpError } from '../middleware/errors.js';
import { listVasps, lookupIntel } from '../vasp/intel.service.js';

const paramsSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS),
  address: z.string().refine(isPlausibleAddress, 'Invalid address'),
});

export async function lookup(req: Request, res: Response) {
  const { chain, address } = paramsSchema.parse(req.params);
  const intel = (await lookupIntel(chain, [address])).get(normalizeAddress(chain, address));
  if (!intel) throw new HttpError(404, 'No intelligence on this address');
  res.json(intel);
}

export async function vasps(_req: Request, res: Response) {
  res.json(await listVasps());
}
