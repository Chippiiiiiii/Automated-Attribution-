import type { Chain } from '../config/networks.js';

export type TxStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

/** Chain-agnostic transfer. One chain transaction may yield several (transferIndex). */
export interface NormalizedTransaction {
  txHash: string;
  transferIndex: number;
  chain: Chain;
  from: string;
  to: string;
  /** Decimal string in whole units of `token` (never a float). */
  amount: string;
  token: string;
  timestamp: string; // ISO-8601 UTC
  blockNumber: number;
  status: TxStatus;
  /** Chain-specific extras (e.g. bridge identifiers). */
  chainDetails?: Record<string, unknown>;
}

export type TokenTransfer = NormalizedTransaction;

export interface QueryOptions {
  limit?: number;
  from?: Date;
  to?: Date;
}

export interface BlockchainProvider {
  readonly chain: Chain;
  readonly nativeToken: string;
  /** Balance of the native token, decimal string. */
  getBalance(address: string): Promise<string>;
  /** Native-currency transfers touching the address, oldest first. */
  getTransactions(address: string, options?: QueryOptions): Promise<NormalizedTransaction[]>;
  getTransaction(txHash: string): Promise<NormalizedTransaction[]>;
  /** Non-native token transfers touching the address, oldest first. */
  getTokenTransfers(address: string, options?: QueryOptions): Promise<TokenTransfer[]>;
}
