# Testing

Run: `cd backend && npm test` (needs Postgres from `docker compose up -d`, test DB `sih2_test`), `cd frontend && npm test`.

| # | Critical test | Where |
|---|---|---|
| 1 | Wallet lookup | `backend/src/blockchain/blockchain.test.ts` (summary, API for every chain) |
| 2 | Transaction normalization | `blockchain.test.ts` (common model, unique keys, decimal amounts) |
| 3 | Graph traversal | `backend/src/graph/graph.test.ts` |
| 4 | Hop calculation | `graph.test.ts`, `attribution/attribution.test.ts` |
| 5 | VASP attribution | `attribution/attribution.test.ts`, `attribution.api.test.ts`, `crosschain/cross-chain.test.ts` |
| 6 | Confidence scoring | `attribution.test.ts` (weights, thresholds, penalties, config changes) |
| 7 | Risk detection | `risk/risk.test.ts` |
| 8 | Case creation | `cases/case.test.ts` |
| 9 | Report generation | `reports/report.test.ts` (JSON + PDF, audit) |
| 10 | Authentication | `cases/case.test.ts`, `security/security.test.ts` |

Also: SAHYOG mock (`sahyog/`), live provider adapters with fake fetch (`blockchain/live/`), VASP intel (`vasp/`), security (`security/`), frontend UI helpers (`frontend/src/components/ui.test.tsx`).
