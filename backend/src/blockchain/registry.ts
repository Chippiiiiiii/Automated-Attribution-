import { env } from '../config/env.js';
import { SUPPORTED_CHAINS, type Chain } from '../config/networks.js';
import { HttpError } from '../middleware/errors.js';
import { DemoProvider } from './demo/demo-provider.js';
import { BitcoinExplorerProvider } from './live/bitcoin-provider.js';
import { EVM_CHAIN_IDS, EvmExplorerProvider } from './live/evm-provider.js';
import type { HttpOptions } from './live/http.js';
import type { BlockchainProvider } from './types.js';

export interface ProviderConfig {
  mode: 'DEMO' | 'LIVE';
  ethereumApiKey?: string | undefined;
  bitcoinApiKey?: string | undefined;
  tronApiKey?: string | undefined;
  solanaApiKey?: string | undefined;
  etherscanBaseUrl: string;
  bitcoinApiUrl: string;
  http?: HttpOptions;
}

const envConfig = (): ProviderConfig => ({
  mode: env.BLOCKCHAIN_PROVIDER,
  ethereumApiKey: env.ETHEREUM_API_KEY, bitcoinApiKey: env.BITCOIN_API_KEY, tronApiKey: env.TRON_API_KEY, solanaApiKey: env.SOLANA_API_KEY,
  etherscanBaseUrl: env.ETHERSCAN_BASE_URL, bitcoinApiUrl: env.BITCOIN_API_URL,
});

/** Live adapters that exist. Tron and Solana are declared but deliberately not implemented (no faked integrations). */
export const LIVE_ADAPTERS: Record<Chain, { adapter: string | null; keyEnv: string; keyRequired: boolean }> = {
  ETHEREUM: { adapter: 'Etherscan API v2', keyEnv: 'ETHEREUM_API_KEY', keyRequired: true },
  BNB: { adapter: 'Etherscan API v2', keyEnv: 'ETHEREUM_API_KEY', keyRequired: true },
  POLYGON: { adapter: 'Etherscan API v2', keyEnv: 'ETHEREUM_API_KEY', keyRequired: true },
  BITCOIN: { adapter: 'Esplora REST', keyEnv: 'BITCOIN_API_KEY', keyRequired: false },
  TRON: { adapter: null, keyEnv: 'TRON_API_KEY', keyRequired: false },
  SOLANA: { adapter: null, keyEnv: 'SOLANA_API_KEY', keyRequired: false },
};

export function isSupportedChain(value: string): value is Chain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(value);
}

export function createProvider(chain: Chain, cfg: ProviderConfig): BlockchainProvider {
  if (cfg.mode === 'DEMO') return new DemoProvider(chain);
  const info = LIVE_ADAPTERS[chain];
  if (!info.adapter) throw new HttpError(501, `No live ${chain} adapter is implemented yet. Use BLOCKCHAIN_PROVIDER=DEMO.`);
  if (chain === 'BITCOIN') return new BitcoinExplorerProvider({ baseUrl: cfg.bitcoinApiUrl, ...(cfg.bitcoinApiKey ? { apiKey: cfg.bitcoinApiKey } : {}), ...(cfg.http ? { http: cfg.http } : {}) });
  if (chain in EVM_CHAIN_IDS) {
    if (!cfg.ethereumApiKey) throw new HttpError(503, `${info.keyEnv} is not configured; live ${chain} lookups are unavailable`);
    return new EvmExplorerProvider(chain, { apiKey: cfg.ethereumApiKey, baseUrl: cfg.etherscanBaseUrl, ...(cfg.http ? { http: cfg.http } : {}) });
  }
  throw new HttpError(501, `No live adapter for ${chain}`);
}

/** Configuration overview for the admin UI. Reports whether a key is set, never its value. */
export function providerStatus(cfg: ProviderConfig = envConfig()) {
  const keys: Record<string, string | undefined> = { ETHEREUM_API_KEY: cfg.ethereumApiKey, BITCOIN_API_KEY: cfg.bitcoinApiKey, TRON_API_KEY: cfg.tronApiKey, SOLANA_API_KEY: cfg.solanaApiKey };
  return {
    mode: cfg.mode,
    chains: SUPPORTED_CHAINS.map((chain) => {
      const i = LIVE_ADAPTERS[chain];
      const keySet = Boolean(keys[i.keyEnv]);
      const ready = cfg.mode === 'DEMO' || (i.adapter !== null && (!i.keyRequired || keySet));
      return { chain, active: cfg.mode === 'DEMO' ? 'Demo ledger' : (i.adapter ?? 'not implemented'), liveAdapter: i.adapter, keyEnv: i.keyEnv, keyConfigured: keySet, keyRequired: i.keyRequired, ready };
    }),
  };
}

const providers = new Map<Chain, BlockchainProvider>();

export function getProvider(chain: Chain): BlockchainProvider {
  let provider = providers.get(chain);
  if (!provider) {
    provider = createProvider(chain, envConfig());
    providers.set(chain, provider);
  }
  return provider;
}
