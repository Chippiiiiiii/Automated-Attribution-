import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app.js';
import { prisma } from '../database/client.js';
import { SUPPORTED_CHAINS, type Chain } from '../config/networks.js';
import { normalizeAddress } from './address.js';
import { DEMO_SCENARIOS, DEMO_TRANSFERS } from './demo/scenarios.js';
import { getProvider } from './registry.js';
import { getAllTransfers, lookupWallet } from './wallet-lookup.js';

// POLYGON only appears as the destination leg of the bridge scenario, so fall back to a transfer party.
const sampleAddress = (chain: Chain) =>
  DEMO_SCENARIOS.find((s) => s.chain === chain)?.suspect ?? DEMO_TRANSFERS.find((t) => t.chain === chain)!.from;

describe('demo ledger + providers', () => {
  it('returns normalised transfers on every supported chain', async () => {
    for (const chain of SUPPORTED_CHAINS) {
      const transfers = await getAllTransfers(chain, sampleAddress(chain));
      expect(transfers.length).toBeGreaterThan(0);
      for (const t of transfers) expect(t.chain).toBe(chain);
    }
  });

  it('normalises every transfer to the common model', () => {
    for (const t of DEMO_TRANSFERS) {
      expect(t.amount).toMatch(/^\d+(\.\d+)?$/);
      expect(new Date(t.timestamp).toISOString()).toBe(t.timestamp);
      expect(t.txHash.length).toBeGreaterThanOrEqual(64);
      expect(t.status).toBe('SUCCESS');
      expect(Number.isInteger(t.blockNumber)).toBe(true);
      expect(t.from).toBe(normalizeAddress(t.chain, t.from));
      expect(t.to).toBe(normalizeAddress(t.chain, t.to));
    }
  });

  it('is deterministic and has unique (chain, hash, index) keys', () => {
    const keys = DEMO_TRANSFERS.map((t) => `${t.chain}:${t.txHash}:${t.transferIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('treats EVM addresses case-insensitively but not Solana/Bitcoin', async () => {
    const upper = await getAllTransfers('ETHEREUM', '0xSUSPECT001');
    const lower = await getAllTransfers('ETHEREUM', '0xsuspect001');
    expect(upper).toEqual(lower);
    expect(upper.length).toBeGreaterThan(0);
    expect(await getAllTransfers('SOLANA', 'solsuspect501')).toEqual([]);
  });

  it('computes native balance with decimal arithmetic', async () => {
    // in 12, out 8 + 3.9 → 0.1 exactly
    expect(await getProvider('ETHEREUM').getBalance('0xSUSPECT001')).toBe('0.1');
  });

  it('splits native and token transfers and filters by time', async () => {
    const eth = getProvider('ETHEREUM');
    expect((await eth.getTokenTransfers('0xSUSPECT001')).length).toBe(0);
    const bnb = getProvider('BNB');
    expect((await bnb.getTransactions('0xSUSPECT102')).length).toBe(0);
    expect((await bnb.getTokenTransfers('0xSUSPECT102')).length).toBe(2);
    const all = await getAllTransfers('ETHEREUM', '0xSUSPECT001');
    const cutoff = new Date(all[1]!.timestamp);
    const later = await getAllTransfers('ETHEREUM', '0xSUSPECT001', { from: cutoff });
    expect(later.length).toBe(all.length - 1);
    expect((await getAllTransfers('ETHEREUM', '0xSUSPECT001', { limit: 2 })).length).toBe(2);
  });

  it('summarises a wallet (lookup)', async () => {
    const s = await lookupWallet('BITCOIN', 'bc1DEMOSUSPECT101');
    expect(s).toMatchObject({ chain: 'BITCOIN', nativeToken: 'BTC', transactionCount: 4, balance: '0.05' });
    expect(s.firstSeen! < s.lastActivity!).toBe(true);
  });

  it('looks up a transaction by hash', async () => {
    const t = DEMO_TRANSFERS.find((x) => x.chain === 'POLYGON')!;
    expect(await getProvider('POLYGON').getTransaction(t.txHash)).toEqual([t]);
    expect(await getProvider('ETHEREUM').getTransaction(t.txHash)).toEqual([]);
  });
});

describe('wallet API', () => {
  let server: Server;
  let base: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'investigator@demo.local', password: process.env.DEMO_PASSWORD ?? 'demo-password-change-me' }),
    });
    headers = { authorization: `Bearer ${(await res.json()).token}` };
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await fetch(`${base}/api/wallets/ETHEREUM/0xSUSPECT001`)).status).toBe(401);
  });

  it('returns summary and transactions for every chain', async () => {
    for (const chain of SUPPORTED_CHAINS as readonly Chain[]) {
      const suspect = sampleAddress(chain);
      const summary = await (await fetch(`${base}/api/wallets/${chain}/${suspect}`, { headers })).json();
      expect(summary.transactionCount).toBeGreaterThan(0);
      const txs = await (await fetch(`${base}/api/wallets/${chain}/${suspect}/transactions`, { headers })).json();
      expect(txs).toHaveLength(summary.transactionCount);
    }
  });

  it('rejects unsupported chains and malformed addresses', async () => {
    expect((await fetch(`${base}/api/wallets/DOGE/abcdefg`, { headers })).status).toBe(400);
    expect((await fetch(`${base}/api/wallets/ETHEREUM/x`, { headers })).status).toBe(400);
    expect((await fetch(`${base}/api/wallets/ETHEREUM/0xSUSPECT001/transactions?limit=0`, { headers })).status).toBe(400);
  });
});
