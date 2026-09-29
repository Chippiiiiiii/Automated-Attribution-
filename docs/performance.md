# Performance

Benchmarks: `cd backend && npx tsx src/perf/bench.ts 100000` (layered network with 30% of traffic through 20 hub wallets, 4 hops, in-memory provider, no DB) and `npx tsx src/perf/bench-hot-edge.ts` (worst case: all transfers on one edge). Regression tests: `backend/src/perf/perf.test.ts`.

| Transfers | Nodes | Edges | Build | Serialize | Path search | Full attribution |
|---|---|---|---|---|---|---|
| 1k | 145 | 907 | 8 ms | <1 ms | 1 ms | 2 ms |
| 10k | 1,268 | 9,208 | 16 ms | 2 ms | 14 ms | 29 ms |
| 100k | 12,479 | 88,916 | 192 ms | 22 ms | 169 ms | 189 ms |

## Bottlenecks found and fixed
- **Quadratic duplicate check in `buildGraph`**: each transfer was compared against every transfer already on its edge. 100k transfers on one hot edge took **20 s**; a `Set` lookup brings it to **105 ms**. The adjacency list also copied its array on every new edge; now it appends.
- **Graph API payload**: the response carried every transfer of every edge (up to 100k rows). It now returns aggregates plus a 5-transfer sample per edge.

## Already in place
- DB indexes: transfers `(chain, fromAddress, timestamp)` and `(chain, toAddress, timestamp)`, edge `(chain, from/to)`, `(chain, address)` uniques on wallets/labels/VASP addresses, `caseId` on all case children, `status` on cases.
- Pagination/limits: wallet transactions `limit` (max 1000); graph `maxNodes` cap (5000) with a `truncated` flag; `findPaths` `maxPaths` cap (200); hops capped at 6.
- Rate limits protect the expensive endpoints (see `docs/security.md`).

## Deliberately not added
- **Caching**: analysis at 100k transfers takes ~0.2 s and results are stored per case, so a cache would add invalidation risk (labels and configs change) for no measurable gain.
- **Async job queue**: no request exceeds a few hundred ms in the benchmark. The real cost will be live provider latency, bounded by timeouts and the heavy-endpoint limiter. Revisit if LIVE mode traverses many hops.

## Limits
- Benchmarks exclude Postgres and network time. The DB path (`lookupIntel`) runs one `IN` query per table, bounded by `maxNodes` (5000).
- The React graph view renders every returned node; beyond ~1-2k nodes use the min-amount / hop filters. **Browser rendering above 2k nodes has not been verified.**
