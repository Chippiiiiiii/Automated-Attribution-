import { Prisma } from '../../generated/prisma/client.js';
import type { Chain } from '../../config/networks.js';
import { normalizeAddress } from '../address.js';
import type { BlockchainProvider, NormalizedTransaction, QueryOptions } from '../types.js';
import { DEMO_TRANSFERS } from './scenarios.js';

export const NATIVE_TOKENS: Record<Chain, string> = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ETH',
  BNB: 'BNB',
  TRON: 'TRX',
  SOLANA: 'SOL',
  POLYGON: 'POL',
};

/** Serves the deterministic DEMO ledger; needs no credentials or network access. */
export class DemoProvider implements BlockchainProvider {
  readonly nativeToken: string;

  constructor(
    readonly chain: Chain,
    private readonly ledger: readonly NormalizedTransaction[] = DEMO_TRANSFERS,
  ) {
    this.nativeToken = NATIVE_TOKENS[chain];
  }

  async getBalance(address: string): Promise<string> {
    const addr = normalizeAddress(this.chain, address);
    let balance = new Prisma.Decimal(0);
    for (const t of this.native(addr)) {
      if (t.to === addr) balance = balance.plus(t.amount);
      if (t.from === addr) balance = balance.minus(t.amount);
    }
    return balance.toString();
  }

  async getTransactions(address: string, options?: QueryOptions) {
    return this.page(this.native(normalizeAddress(this.chain, address)), options);
  }

  async getTokenTransfers(address: string, options?: QueryOptions) {
    const addr = normalizeAddress(this.chain, address);
    return this.page(this.touching(addr).filter((t) => t.token !== this.nativeToken), options);
  }

  async getTransaction(txHash: string) {
    return this.ledger.filter((t) => t.chain === this.chain && t.txHash === txHash);
  }

  private touching(addr: string) {
    return this.ledger.filter((t) => t.chain === this.chain && (t.from === addr || t.to === addr));
  }

  private native(addr: string) {
    return this.touching(addr).filter((t) => t.token === this.nativeToken);
  }

  private page(rows: NormalizedTransaction[], { from, to, limit }: QueryOptions = {}) {
    const inRange = rows.filter((t) => (!from || new Date(t.timestamp) >= from) && (!to || new Date(t.timestamp) <= to));
    inRange.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.txHash.localeCompare(b.txHash));
    return limit ? inRange.slice(0, limit) : inRange;
  }
}
