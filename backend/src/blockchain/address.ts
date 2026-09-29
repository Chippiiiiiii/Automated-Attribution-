import type { Chain } from '../config/networks.js';

const EVM_CHAINS: readonly Chain[] = ['ETHEREUM', 'BNB', 'POLYGON'];

/** Canonical form used for storage and comparison. EVM addresses are case-insensitive. */
export function normalizeAddress(chain: Chain, address: string): string {
  const trimmed = address.trim();
  return EVM_CHAINS.includes(chain) ? trimmed.toLowerCase() : trimmed;
}

/** Deliberately loose: DEMO placeholder addresses must pass; real-format checks belong to real adapters. */
export function isPlausibleAddress(address: string): boolean {
  return /^[A-Za-z0-9_-]{6,128}$/.test(address.trim());
}
