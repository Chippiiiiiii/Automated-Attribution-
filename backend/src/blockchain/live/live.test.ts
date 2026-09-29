import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../middleware/errors.js';
import { createProvider, providerStatus, type ProviderConfig } from '../registry.js';
import { BitcoinExplorerProvider } from './bitcoin-provider.js';
import { EvmExplorerProvider } from './evm-provider.js';
import { getJson } from './http.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fast = { backoffMs: 1, retries: 2 };
const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({ mode: 'LIVE', etherscanBaseUrl: 'https://explorer.test/api', bitcoinApiUrl: 'https://btc.test/api', ...over });

describe('http layer', () => {
  it('retries 429/5xx then succeeds; gives up on other 4xx', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: 1 }));
    expect(await getJson('https://x.test', { fetchImpl: f, ...fast })).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    await expect(getJson('https://x.test', { fetchImpl: g, ...fast })).rejects.toMatchObject({ status: 502 });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('does not leak the URL (which may hold an API key) in errors', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed https://x.test?apikey=SECRET'));
    const err = await getJson('https://x.test?apikey=SECRET', { fetchImpl: f, ...fast }).catch((e: HttpError) => e);
    expect((err as HttpError).message).not.toContain('SECRET');
  });
});

describe('EVM explorer adapter', () => {
  const evm = (fetchImpl: typeof fetch) => new EvmExplorerProvider('POLYGON', { apiKey: 'k', baseUrl: 'https://explorer.test/api', http: { fetchImpl, ...fast } });

  it('normalises native and token transfers with exact decimals and sends chainid + key', async () => {
    const f = vi.fn<typeof fetch>(async (url) => {
      const u = new URL(String(url));
      if (u.searchParams.get('action') === 'txlist')
        return json({ status: '1', message: 'OK', result: [
          { hash: '0xAA', from: '0xAbC', to: '0xDeF', value: '1234567890123456789', timeStamp: '1767225600', blockNumber: '10', isError: '0' },
          { hash: '0xBB', from: '0xabc', to: '0xdef', value: '1000000000000000000', timeStamp: '1767229200', blockNumber: '11', isError: '1' },
          { hash: '0xCC', from: '0xabc', to: '0xdef', value: '0', timeStamp: '1767229200', blockNumber: '12', isError: '0' },
        ] });
      return json({ status: '1', message: 'OK', result: [{ hash: '0xDD', from: '0xabc', to: '0xdef', value: '19900000', tokenSymbol: 'USDT', tokenDecimal: '6', contractAddress: '0xCONTRACT', timeStamp: '1767232800', blockNumber: '13' }] });
    });
    const p = evm(f);
    const native = await p.getTransactions('0xAbC0000000000000000000000000000000000001');
    expect(native).toHaveLength(2); // zero-value call dropped
    expect(native[0]).toMatchObject({ amount: '1.234567890123456789', token: 'POL', from: '0xabc', status: 'SUCCESS', timestamp: '2026-01-01T00:00:00.000Z', blockNumber: 10 });
    expect(native[1]?.status).toBe('FAILED');
    const tokens = await p.getTokenTransfers('0xAbC0000000000000000000000000000000000001');
    expect(tokens[0]).toMatchObject({ amount: '19.9', token: 'USDT', chainDetails: { contract: '0xcontract' } });
    const first = new URL(String(f.mock.calls[0]?.[0]));
    expect(first.searchParams.get('chainid')).toBe('137');
    expect(first.searchParams.get('apikey')).toBe('k');
  });

  it('treats "No transactions found" as empty and surfaces API errors without the key', async () => {
    expect(await evm(async () => json({ status: '0', message: 'No transactions found', result: [] })).getTransactions('0xabc')).toEqual([]);
    const err = await evm(async () => json({ status: '0', message: 'NOTOK', result: 'Max rate limit reached apikey=k' })).getTransactions('0xabc').catch((e: HttpError) => e);
    expect(err).toMatchObject({ status: 502 });
    expect((err as HttpError).message).not.toContain('apikey=k');
  });

  it('applies the time filter', async () => {
    const p = evm(async () => json({ status: '1', message: 'OK', result: [
      { hash: '0x1', from: '0xa', to: '0xb', value: '1', timeStamp: '1767225600', blockNumber: '1' },
      { hash: '0x2', from: '0xa', to: '0xb', value: '1', timeStamp: '1767398400', blockNumber: '2' },
    ] }));
    expect((await p.getTransactions('0xa', { from: new Date('2026-01-02T00:00:00Z') })).map((t) => t.txHash)).toEqual(['0x2']);
  });
});

describe('Bitcoin explorer adapter', () => {
  const tx = {
    txid: 'tx1',
    vin: [{ prevout: { scriptpubkey_address: 'bc1qsuspect', value: 60_000_000 } }, { prevout: { scriptpubkey_address: 'bc1qother', value: 40_000_000 } }],
    vout: [{ scriptpubkey_address: 'bc1qdest', value: 90_000_000 }, { scriptpubkey_address: 'bc1qsuspect', value: 9_000_000 }, { value: 0 }],
    status: { confirmed: true, block_height: 100, block_time: 1767225600 },
  };
  const btc = (f: typeof fetch) => new BitcoinExplorerProvider({ baseUrl: 'https://btc.test/api', http: { fetchImpl: f, ...fast } });

  it('splits outputs across input addresses, drops change and skips coinbase', async () => {
    const coinbase = { txid: 'cb', vin: [{ is_coinbase: true }], vout: [{ scriptpubkey_address: 'bc1qsuspect', value: 5 }], status: { confirmed: true, block_height: 1, block_time: 1 } };
    const p = btc(async () => json([tx, coinbase]));
    const out = await p.getTransactions('bc1qsuspect');
    expect(out).toHaveLength(2); // suspect->dest and other->suspect(change output funded by other)
    const toDest = out.find((t) => t.to === 'bc1qdest');
    expect(toDest).toMatchObject({ from: 'bc1qsuspect', amount: '0.54', token: 'BTC', status: 'SUCCESS' });
    expect(out.every((t) => t.txHash === 'tx1')).toBe(true);
  });

  it('computes balance in BTC from funded/spent sums', async () => {
    expect(await btc(async () => json({ chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000 } })).getBalance('bc1qx')).toBe('1');
  });
});

describe('registry / configuration', () => {
  it('DEMO mode needs no keys', () => {
    expect(createProvider('TRON', cfg({ mode: 'DEMO' })).chain).toBe('TRON');
  });
  it('LIVE mode: EVM requires the key, Bitcoin does not, Tron/Solana are honest 501s', () => {
    expect(() => createProvider('ETHEREUM', cfg())).toThrowError(/ETHEREUM_API_KEY/);
    expect(createProvider('ETHEREUM', cfg({ ethereumApiKey: 'k' }))).toBeInstanceOf(EvmExplorerProvider);
    expect(createProvider('BITCOIN', cfg())).toBeInstanceOf(BitcoinExplorerProvider);
    expect(() => createProvider('TRON', cfg({ tronApiKey: 'k' }))).toThrowError(/adapter is implemented yet/);
    expect(() => createProvider('SOLANA', cfg())).toThrowError(/adapter is implemented yet/);
  });
  it('status reports readiness and never includes key values', () => {
    const s = providerStatus(cfg({ ethereumApiKey: 'SUPERSECRET' }));
    expect(JSON.stringify(s)).not.toContain('SUPERSECRET');
    const by = Object.fromEntries(s.chains.map((c) => [c.chain, c]));
    expect(by.ETHEREUM).toMatchObject({ keyConfigured: true, ready: true });
    expect(by.BNB).toMatchObject({ ready: true });
    expect(by.BITCOIN).toMatchObject({ keyConfigured: false, ready: true });
    expect(by.TRON).toMatchObject({ ready: false });
    expect(providerStatus(cfg({ mode: 'DEMO' })).chains.every((c) => c.ready)).toBe(true);
  });
});
