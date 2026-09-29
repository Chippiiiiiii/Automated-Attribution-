import { Prisma } from '../../generated/prisma/client.js';
import { normalizeAddress } from '../address.js';
import type { BlockchainProvider, NormalizedTransaction, QueryOptions } from '../types.js';
import { getJson, type HttpOptions } from './http.js';

interface EsploraTx {
  txid: string;
  vin: { prevout?: { scriptpubkey_address?: string; value: number } | null; is_coinbase?: boolean }[];
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_height?: number; block_time?: number };
}

const SATS = new Prisma.Decimal(1e8);

/**
 * Bitcoin adapter for Esplora-compatible APIs (e.g. blockstream.info, no key needed).
 * UTXO transactions are mapped to address-to-address transfers with the common-input-ownership heuristic:
 * each output is attributed to the input addresses in proportion to their input value; change back to an
 * input address is dropped. This is an analytical inference, not ground truth. Coinbase transactions are skipped.
 */
export class BitcoinExplorerProvider implements BlockchainProvider {
  readonly chain = 'BITCOIN' as const;
  readonly nativeToken = 'BTC';

  constructor(private readonly cfg: { baseUrl: string; apiKey?: string; http?: HttpOptions }) {}

  private get<T>(path: string) {
    const headers = this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : undefined;
    return getJson<T>(`${this.cfg.baseUrl}${path}`, { ...this.cfg.http, headers: { ...this.cfg.http?.headers, ...headers } });
  }

  async getBalance(address: string) {
    const a = await this.get<{ chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }>(`/address/${normalizeAddress('BITCOIN', address)}`);
    return new Prisma.Decimal(a.chain_stats.funded_txo_sum - a.chain_stats.spent_txo_sum).div(SATS).toString();
  }

  async getTransactions(address: string, options?: QueryOptions) {
    const addr = normalizeAddress('BITCOIN', address);
    const limit = options?.limit ?? 200;
    const txs: EsploraTx[] = [];
    let page = await this.get<EsploraTx[]>(`/address/${addr}/txs`);
    while (page.length > 0 && txs.length < limit) {
      txs.push(...page);
      const last = page.at(-1);
      if (page.length < 25 || !last) break;
      page = await this.get<EsploraTx[]>(`/address/${addr}/txs/chain/${last.txid}`);
    }
    return txs
      .slice(0, limit)
      .flatMap((t) => this.transfers(t))
      .filter((t) => t.from === addr || t.to === addr)
      .filter((t) => (!options?.from || Date.parse(t.timestamp) >= options.from.getTime()) && (!options?.to || Date.parse(t.timestamp) <= options.to.getTime()))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.txHash.localeCompare(b.txHash));
  }

  async getTokenTransfers() {
    return [];
  }

  async getTransaction(txHash: string) {
    return this.transfers(await this.get<EsploraTx>(`/tx/${txHash}`));
  }

  private transfers(tx: EsploraTx): NormalizedTransaction[] {
    if (tx.vin.some((i) => i.is_coinbase || !i.prevout)) return [];
    const inputs = new Map<string, Prisma.Decimal>();
    for (const i of tx.vin) {
      const a = i.prevout?.scriptpubkey_address;
      if (a) inputs.set(a, (inputs.get(a) ?? new Prisma.Decimal(0)).plus(i.prevout!.value));
    }
    const total = [...inputs.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
    if (total.isZero()) return [];
    const timestamp = tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : new Date().toISOString();
    const out: NormalizedTransaction[] = [];
    for (const o of tx.vout) {
      if (!o.scriptpubkey_address || o.value === 0) continue;
      for (const [from, inValue] of inputs) {
        if (from === o.scriptpubkey_address) continue; // change
        const amount = new Prisma.Decimal(o.value).mul(inValue).div(total).div(SATS).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN);
        if (amount.isZero()) continue;
        out.push({
          txHash: tx.txid, transferIndex: out.length, chain: 'BITCOIN', from, to: o.scriptpubkey_address, amount: amount.toString(), token: 'BTC',
          timestamp, blockNumber: tx.status.block_height ?? 0, status: tx.status.confirmed ? 'SUCCESS' : 'PENDING',
          chainDetails: { heuristic: 'common-input-ownership' },
        });
      }
    }
    return out;
  }
}
