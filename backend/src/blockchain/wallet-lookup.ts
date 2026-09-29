import type { Chain } from '../config/networks.js';
import { normalizeAddress } from './address.js';
import { getProvider } from './registry.js';
import type { NormalizedTransaction, QueryOptions } from './types.js';

export interface WalletSummary {
  address: string;
  chain: Chain;
  nativeToken: string;
  balance: string;
  transactionCount: number;
  firstSeen: string | null;
  lastActivity: string | null;
}

/** All transfers (native + token) touching an address, oldest first. */
export async function getAllTransfers(chain: Chain, address: string, options?: QueryOptions): Promise<NormalizedTransaction[]> {
  const provider = getProvider(chain);
  const [native, tokens] = await Promise.all([provider.getTransactions(address, options), provider.getTokenTransfers(address, options)]);
  return [...native, ...tokens].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.txHash.localeCompare(b.txHash));
}

export async function lookupWallet(chain: Chain, address: string): Promise<WalletSummary> {
  const provider = getProvider(chain);
  const [balance, transfers] = await Promise.all([provider.getBalance(address), getAllTransfers(chain, address)]);
  return {
    address: normalizeAddress(chain, address),
    chain,
    nativeToken: provider.nativeToken,
    balance,
    transactionCount: transfers.length,
    firstSeen: transfers[0]?.timestamp ?? null,
    lastActivity: transfers.at(-1)?.timestamp ?? null,
  };
}
