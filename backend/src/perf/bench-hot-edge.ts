/** Worst case: N transfers all on a single suspect->VASP edge. Run: npx tsx src/perf/bench-hot-edge.ts */
import { build } from '../blockchain/demo/builder.js';
import { buildGraph } from '../graph/build-graph.js';

for (const n of [1_000, 10_000, 100_000]) {
  const ts = Array.from({ length: n }, (_, i) => build({ chain: 'ETHEREUM', key: `h${i}`, from: '0xsuspect', to: '0xvasp0001', amount: '1', token: 'ETH', atHour: i % 500 }));
  const t = performance.now();
  const g = await buildGraph({ chain: 'ETHEREUM', address: '0xsuspect', maxHops: 2, source: (async (_c: string, a: string) => (a === '0xsuspect' ? ts : [])) as never });
  console.log(`${n} transfers on one edge: edges=${g.edges.length} txCount=${g.edges[0]?.txCount} build=${(performance.now() - t).toFixed(0)}ms`);
}
