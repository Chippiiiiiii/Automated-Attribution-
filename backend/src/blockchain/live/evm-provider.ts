import { Prisma } from '../../generated/prisma/client.js';
import type { Chain } from '../../config/networks.js';
import { HttpError } from '../../middleware/errors.js';
import { normalizeAddress } from '../address.js';
import { NATIVE_TOKENS } from '../demo/demo-provider.js';
import type { BlockchainProvider, NormalizedTransaction, QueryOptions } from '../types.js';
import { getJson, type HttpOptions } from './http.js';

export const EVM_CHAIN_IDS: Partial<Record<Chain, number>> = { ETHEREUM: 1, BNB: 56, POLYGON: 137 };

interface Envelope<T> { status: string; message: string; result: T }
interface RawTx { hash: string; from: string; to: string; value: string; timeStamp: string; blockNumber: string; isError?: string }
interface RawTokenTx extends RawTx { tokenSymbol: string; tokenDecimal: string; contractAddress: string }

const scale = (raw: string, decimals: number) => new Prisma.Decimal(raw).div(new Prisma.Decimal(10).pow(decimals)).toString();
const iso = (unixSeconds: string) => new Date(Number(unixSeconds) * 1000).toISOString();

/**
 * Etherscan-family (API v2, one key for all EVM chains) adapter for Ethereum, BNB Chain and Polygon.
 * Covers external transfers and ERC-20 transfers. Internal (contract-initiated) transfers are not fetched.
 * Response shapes follow the public Etherscan documentation; verify against the live service before relying on it.
 */
export class EvmExplorerProvider implements BlockchainProvider {
  readonly nativeToken: string;
  private readonly chainId: number;

  constructor(
    readonly chain: Chain,
    private readonly cfg: { apiKey?: string; baseUrl: string; http?: HttpOptions },
  ) {
    const id = EVM_CHAIN_IDS[chain];
    if (!id) throw new HttpError(500, `${chain} is not an EVM chain`);
    this.chainId = id;
    this.nativeToken = NATIVE_TOKENS[chain];
  }

  private async call<T>(params: Record<string, string>): Promise<T> {
    const q = new URLSearchParams({ chainid: String(this.chainId), ...params, ...(this.cfg.apiKey ? { apikey: this.cfg.apiKey } : {}) });
    const body = await getJson<Envelope<T> | { result?: T; error?: unknown }>(`${this.cfg.baseUrl}?${q}`, this.cfg.http);
    if ('status' in body && body.status === '0' && !(Array.isArray(body.result) && body.result.length === 0) && body.message !== 'No transactions found') {
      // Etherscan reports rate limits / bad keys as status 0 with a string result; surface without echoing key material.
      throw new HttpError(502, `Explorer API error: ${typeof body.result === 'string' ? body.result.replace(/apikey=\S+/gi, '') : body.message}`);
    }
    return (body as { result: T }).result;
  }

  async getBalance(address: string): Promise<string> {
    const wei = await this.call<string>({ module: 'account', action: 'balance', address: normalizeAddress(this.chain, address), tag: 'latest' });
    return scale(wei, 18);
  }

  private inRange(t: NormalizedTransaction, o?: QueryOptions) {
    const ts = Date.parse(t.timestamp);
    return (!o?.from || ts >= o.from.getTime()) && (!o?.to || ts <= o.to.getTime());
  }

  async getTransactions(address: string, options?: QueryOptions) {
    const addr = normalizeAddress(this.chain, address);
    const rows = await this.call<RawTx[]>({ module: 'account', action: 'txlist', address: addr, sort: 'asc', page: '1', offset: String(options?.limit ?? 1000) });
    const seq = new Map<string, number>();
    return rows
      .filter((r) => r.to && r.value !== '0')
      .map<NormalizedTransaction>((r) => ({
        txHash: r.hash, transferIndex: this.next(seq, r.hash), chain: this.chain, from: r.from.toLowerCase(), to: r.to.toLowerCase(),
        amount: scale(r.value, 18), token: this.nativeToken, timestamp: iso(r.timeStamp), blockNumber: Number(r.blockNumber),
        status: r.isError === '1' ? 'FAILED' : 'SUCCESS',
      }))
      .filter((t) => this.inRange(t, options));
  }

  async getTokenTransfers(address: string, options?: QueryOptions) {
    const addr = normalizeAddress(this.chain, address);
    const rows = await this.call<RawTokenTx[]>({ module: 'account', action: 'tokentx', address: addr, sort: 'asc', page: '1', offset: String(options?.limit ?? 1000) });
    const seq = new Map<string, number>();
    return rows
      .map<NormalizedTransaction>((r) => ({
        txHash: r.hash, transferIndex: this.next(seq, r.hash), chain: this.chain, from: r.from.toLowerCase(), to: r.to.toLowerCase(),
        amount: scale(r.value, Number(r.tokenDecimal)), token: r.tokenSymbol, timestamp: iso(r.timeStamp), blockNumber: Number(r.blockNumber),
        status: 'SUCCESS', chainDetails: { contract: r.contractAddress.toLowerCase() },
      }))
      .filter((t) => this.inRange(t, options));
  }

  /** Native part of a transaction only; token transfers inside it are not decoded. */
  async getTransaction(txHash: string) {
    const tx = await this.call<{ hash: string; from: string; to: string | null; value: string; blockNumber: string | null } | null>({ module: 'proxy', action: 'eth_getTransactionByHash', txhash: txHash });
    if (!tx || !tx.to || !tx.blockNumber) return [];
    const block = await this.call<{ timestamp: string } | null>({ module: 'proxy', action: 'eth_getBlockByNumber', tag: tx.blockNumber, boolean: 'false' });
    if (!block) return [];
    const wei = BigInt(tx.value).toString();
    if (wei === '0') return [];
    return [{
      txHash: tx.hash, transferIndex: 0, chain: this.chain, from: tx.from.toLowerCase(), to: tx.to.toLowerCase(), amount: scale(wei, 18),
      token: this.nativeToken, timestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(), blockNumber: Number(BigInt(tx.blockNumber)), status: 'SUCCESS' as const,
    }];
  }

  private next(seq: Map<string, number>, hash: string) {
    const n = seq.get(hash) ?? 0;
    seq.set(hash, n + 1);
    return n;
  }
}
