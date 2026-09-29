import { createHash } from 'node:crypto';
import { normalizeAddress } from '../address.js';
import type { Chain } from '../../config/networks.js';
import type { NormalizedTransaction } from '../types.js';

export const DEMO_EPOCH = Date.UTC(2026, 2, 1); // 2026-03-01T00:00:00Z
const BLOCK_BASE: Record<Chain, number> = {
  BITCOIN: 900_000,
  ETHEREUM: 24_000_000,
  BNB: 60_000_000,
  TRON: 70_000_000,
  SOLANA: 400_000_000,
  POLYGON: 80_000_000,
};
const BLOCKS_PER_HOUR: Record<Chain, number> = { BITCOIN: 6, ETHEREUM: 300, BNB: 1200, TRON: 1200, SOLANA: 9000, POLYGON: 1800 };

export interface DemoTransfer {
  chain: Chain;
  key: string; // stable id; the tx hash is derived from it
  from: string;
  to: string;
  amount: string;
  token: string;
  /** Hours after DEMO_EPOCH. */
  atHour: number;
  chainDetails?: Record<string, unknown>;
}

export function hashFor(chain: Chain, key: string): string {
  const hex = createHash('sha256').update(`demo:${chain}:${key}`).digest('hex');
  return chain === 'ETHEREUM' || chain === 'BNB' || chain === 'POLYGON' ? `0x${hex}` : hex;
}

export function build(t: DemoTransfer): NormalizedTransaction {
  return {
    txHash: hashFor(t.chain, t.key),
    transferIndex: 0,
    chain: t.chain,
    from: normalizeAddress(t.chain, t.from),
    to: normalizeAddress(t.chain, t.to),
    amount: t.amount,
    token: t.token,
    timestamp: new Date(DEMO_EPOCH + t.atHour * 3_600_000).toISOString(),
    blockNumber: BLOCK_BASE[t.chain] + t.atHour * BLOCKS_PER_HOUR[t.chain],
    status: 'SUCCESS',
    ...(t.chainDetails ? { chainDetails: t.chainDetails } : {}),
  };
}
