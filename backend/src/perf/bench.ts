/**
 * Synthetic graph benchmark (no DB, no network). Run: npx tsx src/perf/bench.ts [maxNodes]
 * Builds a layered fan-out network of N transfers from one suspect, with a VASP address at the far end.
 */
import { build } from '../blockchain/demo/builder.js';
import type { NormalizedTransaction } from '../blockchain/types.js';
import { buildGraph, serializeGraph } from '../graph/build-graph.js';
import { findPaths } from '../graph/paths.js';
import { attribute } from '../attribution/engine.js';

const SUSPECT = '0xsuspect';
const VASP_ADDR = '0xvasp0001';

function synth(n: number) {
  const bySender = new Map<string, NormalizedTransaction[]>();
  const push = (t: NormalizedTransaction) => {
    for (const a of [t.from, t.to]) bySender.set(a, [...(bySender.get(a) ?? []), t]);
  };
  const nodes = Math.max(10, Math.round(n / 8));
  const addr = (i: number) => `0x${i.toString(16).padStart(8, '0')}`;
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = () => (rnd() < 0.3 ? addr(Math.floor(rnd() * 20)) : addr(20 + Math.floor(rnd() * nodes))); // 30% of traffic hits 20 hub wallets
  const seeds = Math.max(5, Math.round(n / 50));
  for (let i = 0; i < n; i++) {
    const from = i < seeds ? SUSPECT : pick();
    const to = i >= n - 100 ? VASP_ADDR : pick();
    if (from === to) continue;
    push(build({ chain: 'ETHEREUM', key: `b${i}`, from, to, amount: '1.5', token: 'ETH', atHour: Math.floor(rnd() * 500) }));
  }
  return (_chain: string, address: string) => Promise.resolve(bySender.get(address) ?? []);
}

const ms = (t: number) => `${(performance.now() - t).toFixed(0)}ms`;
const maxNodes = Number(process.argv[2] ?? 5000);
for (const n of [1_000, 10_000, 100_000]) {
  const source = synth(n);
  let t = performance.now();
  const g = await buildGraph({ chain: 'ETHEREUM', address: SUSPECT, maxHops: 4, maxNodes, source: source as never });
  const tBuild = ms(t);
  t = performance.now(); serializeGraph(g); const tSer = ms(t);
  t = performance.now();
  findPaths(g, { isTarget: (k) => k.endsWith(VASP_ADDR) });
  const tPaths = ms(t);
  t = performance.now();
  const r = await attribute({ chain: 'ETHEREUM', walletAddress: SUSPECT, maxHops: 4 } as never, {
    source: source as never,
    intel: (async (_c: string, addrs: string[]) => new Map(addrs.filter((a) => a === VASP_ADDR).map((a) => [a, { vaspId: 'v', entityId: 'e', name: 'V', type: 'EXCHANGE', addressType: 'DEPOSIT', isVasp: true, confidence: 90, isDemo: true }]))) as never,
  });
  console.log(`${n} transfers: nodes=${g.nodes.size} edges=${g.edges.length} trunc=${g.truncated} build=${tBuild} serialize=${tSer} paths=${tPaths} attribute=${ms(t)} candidates=${r.candidates.length}`);
}
