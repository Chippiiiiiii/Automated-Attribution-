# PROJECT STATUS

STAGE 0 — [x] Project initialization
STAGE 1 — [x] Database + core models
STAGE 2 — [x] Authentication + authorization
STAGE 3 — [x] Blockchain provider framework
STAGE 4 — [x] Transaction graph engine
STAGE 5 — [x] VASP entity database
STAGE 6 — [x] VASP attribution engine
STAGE 7 — [x] Risk analysis engine
STAGE 8 — [x] Multi-chain / cross-chain analysis
STAGE 9 — [x] Investigation dashboard
STAGE 10 — [x] Graph visualization
STAGE 11 — [x] Investigation reporting
STAGE 12 — [x] SAHYOG mock integration
STAGE 13 — [x] Real API adapter architecture
STAGE 14 — [x] Security hardening
STAGE 15 — [x] Testing
STAGE 16 — [x] Demo data + scenarios
STAGE 17 — [x] Performance
STAGE 18 — [x] Final integration
STAGE 19 — [x] Hackathon demo preparation

## Workflow (read first every session)
1. Find the first `[ ]` stage above; don't redo `[x]` stages.
2. Implement only that stage, run tests, verify acceptance, record it in the log below, tick the box, commit if git exists, continue to the next.
3. If context runs low: update this file with done/remaining, stop cleanly.
Full spec of every stage = the original master prompt (stage list is summarised in README/docs). Legal rule: attributions are inferences, never confirmed identities; UI must show "Blockchain attribution is an analytical inference and does not by itself establish beneficial ownership." Demo data is always labelled DEMO. Never fake an external integration (SAHYOG is MOCK only).

## Layout
- `backend/` Express + TS (ESM, NodeNext, strict). `src/{api,controllers,services,blockchain,attribution,graph,risk,vasp,reports,cases,auth,database,middleware,utils,config}`. Prisma 7 (driver adapter `@prisma/adapter-pg`, client generated to `src/generated/prisma`, config in `prisma.config.ts`).
- `frontend/` Vite + React 19 + TS + Tailwind 4 + Recharts + @xyflow/react + Axios + React Router. Dev proxy `/api` -> :4000.
- Tests use a separate DB `sih2_test` (create: `docker exec sih2-db-1 psql -U sih -d sih2 -c 'CREATE DATABASE sih2_test'`, then `DATABASE_URL=<test url> npx prisma migrate deploy && ... db seed`); URL is set in `backend/vitest.config.ts`.
- Root `.env` (gitignored; template `.env.example`), `docker-compose.yml` (Postgres 16).

## Commands
- DB: `docker compose up -d --wait` (host port **5433**; 5432 is used by an unrelated container on this machine)
- Backend: `cd backend && npm run dev` (:4000), `npm run typecheck`, `npm test`
- Frontend: `cd frontend && npm run dev` (:5173), `npm run build`
- Docker Desktop must be running (`open -a Docker`).

## Stage log
### Stage 0 — completed 2026-09-29
- Summary: monorepo scaffold, env validation (zod), Prisma 7 wired to Postgres, `GET /api/health` (checks DB), Vite+Tailwind shell page calling health through proxy, docs/architecture.md, README.
- Verified: backend typecheck clean; health returns `database: connected`; frontend typecheck + build pass; proxy `:5173/api/health` works.
- Tests: none yet (Stage 15 covers formal suite; tests added per stage where cheap).
- Limitations: no git repo initialised; no models/migrations yet (Stage 1).


### Stage 1 — completed 2026-09-29
- Summary: full Prisma schema (users, investigators, blockchain_networks keyed by chain `code`, cases, case_notes, wallets, case_wallets, transactions, transaction_edges, entities, vasps, vasp_addresses, address_labels, attribution_results, risk_scores, investigation_reports, audit_logs). Migrations `init` + `audit_immutable` (DB trigger rejects UPDATE/DELETE/TRUNCATE on audit_logs). Idempotent seed (6 networks, admin@demo.local + investigator@demo.local with `DEMO_PASSWORD`, one DEMO case). Case API: `POST/GET /api/cases`, `GET /api/cases/:id` with zod validation, central error handler, CASE_CREATED audit event, case number `CASE-YYYY-NNNNN`.
- Tests: `backend` vitest 3/3 (create+read case, validation/404, audit immutability).
- Limitations: `POST /api/cases` takes `createdById` from body and routes are unprotected until Stage 2. VASP/entity seed data comes in Stage 5.

### Stage 2 — completed 2026-09-29
- Summary: `POST /api/auth/login` (bcrypt, constant-time-ish for unknown emails, rate-limited 10/15min, LOGIN/LOGIN_FAILED audit), `GET /api/auth/me`, JWT HS256 (`sub` only; user re-loaded per request so deactivated users are cut off), `authenticate` + `requireRole` middleware, `/api/cases` protected (creator = token user), `/api/admin/config` ADMIN-only read-only config. Seed logins: admin@demo.local / investigator@demo.local, password = `DEMO_PASSWORD` (default in `.env.example`, DEMO only).
- Tests: backend vitest 8/8 (401 missing/malformed/forged token, uniform login failure, no hash leak, 403 investigator on admin, 200 admin, deactivated user).
- Limitations: no refresh tokens/logout revocation (token expires in `JWT_EXPIRES_IN`); no user-management API yet.

### Stage 3 — completed 2026-09-29
- Summary: `blockchain/` — `BlockchainProvider` interface, `NormalizedTransaction` (amounts are decimal strings), address normalisation (EVM lowercased; BTC/Tron/Solana untouched), `DemoProvider` (one class, one instance per chain via `registry.getProvider`) over a deterministic synthetic ledger (`blockchain/demo/scenarios.ts`: scenarios S1 BTC direct, S1b BNB direct, S2 ETH two-hop (`0xSUSPECT001`), S3 TRON mixer, S4 ETH→POLYGON bridge (bridgeId `BR-401` in `chainDetails` on both legs), S5 SOLANA multi-candidate). Native transfers via `getTransactions`, non-native via `getTokenTransfers`; `getAllTransfers`/`lookupWallet` combine. API: `GET /api/wallets/:chain/:address[/transactions]`. Seed now creates one DEMO case per scenario.
- Decision: no per-chain adapter classes until Stage 13 (real APIs need real per-chain normalisers; DEMO needs only one).
- Tests: 19 backend total at this point (all six chains normalised, EVM case-insensitivity, decimal balance, filters, API auth/validation).
- Limitations: `BLOCKCHAIN_PROVIDER` other than DEMO returns 501. Dev DB still holds the obsolete pre-Stage-3 case "DEMO: Direct exchange deposit" (cases can't be deleted — audit FK); `prisma migrate reset` clears it.

### Stage 4 — completed 2026-09-29
- Summary: `graph/` — `buildGraph` (BFS outbound/inbound, maxHops ≤ 6, maxNodes cap with `truncated` flag, filters: time/minAmount/tokens, injectable `TransferSource`), aggregated per-(from,to,token) edges, `findPaths`/`hopDistance` (simple, **time-consistent** paths: a hop may only use transfers at/after funds reached its tail; stops at first target; outbound only), `serializeGraph`. Node key = `chain:address`. API: `GET /api/graph/:chain/:address?maxHops&direction&minAmount&from&to&token`.
- Tests: 33 backend total; A→B→C→Exchange distance 3, maxHops, cycles, temporal ordering, filters, truncation, DEMO S1/S2 distances.
- Limitations: graph not persisted to `transaction_edges` yet (attribution stage does that); cross-chain edges come in Stage 8; no graph API test yet (Stage 15).

### Stage 5 — completed 2026-09-29
- Summary: `vasp/` — 8 DEMO VASPs plus Demo Mixer and Demo Bridge (`demo-intel.ts`), `lookupIntel(chain, addresses)`, `listVasps`, seeded idempotently into entities/vasps/vasp_addresses/address_labels; every entity has `isDemo=true`. API: `GET /api/intel/...`.
- Tests: 39 backend total at this point.
- Limitations: labels are synthetic; real label sources arrive with Stage 13 adapters.

### Stage 6 — completed 2026-09-29
- Summary: `attribution/` — `engine.ts` `attribute()` (outbound time-consistent paths to VASP-labelled nodes, grouped per VASP, ranked by score → distance → amount, `reasoning[]` compares the pick with the closest-by-hops candidate, UNKNOWN/0 when nothing found), `scoring.ts` (transparent weighted factors normalised by the weight sum, mixer penalty, configurable thresholds), `config.ts` (zod, stored in `app_config`, ADMIN-editable), `attribution.service.ts` (persists `attribution_results`, upserts `transaction_edges` along candidate paths, audits ANALYSIS_STARTED/COMPLETED + ATTRIBUTION_GENERATED, case OPEN→ANALYZING→REVIEW).
- API: `POST /api/cases/:id/wallets|notes|analyze`, `PATCH /api/cases/:id/status`, `GET /api/cases/:id/attributions`, `GET|PUT /api/admin/attribution-config`.
- Demo scores: S1 97 CONFIRMED, S2 81 STRONGLY_INFERRED (not tuned to the prompt's 92), S3 58 PROBABLE (mixer penalty), S5 multi-candidate with explanation.
- Tests: 51 backend total (scenarios, unknown case, threshold configurability, API flow, admin authz, validation).
- Limitations: raw `transactions` rows are not persisted (provider is the source of truth); docs/attribution-engine.md is short. Address validation is deliberately loose (DEMO addresses).

### Stage 7 — completed 2026-09-29
- Summary: `risk/` — pure `assessRisk(facts, config)` (7 explainable indicators: mixer exposure, bridge usage, OTC exposure, rapid pass-through, fan-out, layering via unlabeled chain, structuring; score = capped sum of configured points; LOW/MEDIUM/HIGH/CRITICAL by configurable thresholds), `engine.ts` gathers facts from outbound graph (maxHops) + 1-hop inbound graph + intel labels + `chainDetails.bridgeId`, `risk.service.ts` persists `risk_scores` with RISK_SCORED audit.
- API: `POST|GET /api/cases/:id/risk`, `GET|PUT /api/admin/risk-config` (ADMIN, audited).
- Demo: S3 = HIGH (mixer 40 + rapid 15), S4 flagged for bridge, S2 no mixer/bridge.
- Tests: 58 backend total.
- Limitations: heuristics only; no sanctions/darknet label feed (no real data source in DEMO); risk is per-wallet, not per-path.

### Stage 8 — completed 2026-09-29
- Summary: `crosschain/` — `findBridgeLinks(graph, chain)` detects bridge deposits (transfer `chainDetails.bridgeId` + `destChain`), finds the bridge entity's addresses on the destination chain via intel labels and matches the release by `srcTxHash` (preferred) or `bridgeId`; `attributeAcrossChains` runs the single-chain engine on the origin chain and again from the release recipient on the destination chain (time window starts at the release, hop budget reduced, max 2 crossings), keeps the strongest result, inserts an explicit bridge hop (`PathHopView.bridgeId`, per-hop `chain`), adds a `bridgeCrossing` penalty (new `penalties.bridgeCrossing`, default 10, in attribution config) and `bridgeLinks`. `analyzeWallet` now uses it, so analyze/attributions endpoints are cross-chain aware; edges persisted from the selected path only (bridge hop excluded).
- Demo: S4 → Demo Exchange Polygon, path ETHEREUM → POLYGON ×2.
- Tests: 63 backend total (S4 no-VASP single-chain, link matching, cross-chain path/penalty, hop budget, single-chain unchanged).
- Limitations: bridge matching depends on `chainDetails` (DEMO); real adapters (Stage 13) must supply bridge ids or a bridge-API matcher; amount matching not used.

### Stage 9 — completed 2026-09-29
- Summary: frontend `src/` — `api/client.ts` (axios + bearer token from localStorage, 401 → /login, `errorMessage`), `api/types.ts`, `auth/AuthContext`, `components/ui.tsx` (badges incl. DEMO, cards, `DISCLAIMER`), `Layout` (DEMO banner when `providerMode=DEMO`, role-aware nav, disclaimer footer), pages: Login, Dashboard (status counts, risk chart via Recharts, latest attributions), Cases (list + create), CaseDetail (status change, add wallet, max-hops, run attribution, score risk, evidence/path/candidates/reasoning display, notes, audit trail), VASP directory (filter), Admin (JSON editors for attribution + risk config; admin only). Backend added `GET /api/cases/summary`, `GET /api/cases/:id/audit`. `.claude/launch.json` starts backend (:4000) and frontend (:5173).
- Also fixed: cross-chain result now re-scores proximity on total hops incl. the crossing so the evidence table sums to the confidence (S4 = 3 hops).
- Verified in browser: login, dashboard, S4 analysis (bridge hop shown), risk scoring, audit trail. Frontend build passes.
- Limitations: graph view (Stage 10), reports (11) and SAHYOG (12) buttons not present yet; no pagination; admin editor is raw JSON.

### Stage 10 — completed 2026-09-29
- `GET /api/graph/:chain/:address` now returns per-node `intel` (name/type/isVasp/confidence/isDemo) and `bridgeLinks`; test added in `graph.test.ts`.
- Frontend `components/GraphPanel.tsx` (@xyflow/react): depth-column layout, nodes coloured suspect/VASP/mixer/bridge/other, attribution path highlighted, edge labels amount+tx count, direction/hops/min-amount controls, node detail on click, truncation and bridge notices. "View graph" button per wallet in CaseDetail.
- Verified in browser on DEMO S4 (bridge node labelled, path highlighted).
- Limitations: graph is single-chain per request (cross-chain tail not drawn — bridge shown as notice); simple column layout, no export yet.

### Stage 11 — completed 2026-09-29
- `backend/src/reports/`: `report.builder.ts` (snapshot of case, latest attribution + risk per wallet, notes, audit, disclaimers, limitations), `report.pdf.ts` (pdfkit, pure render of stored content; ASCII arrows only — Helvetica lacks →), `report.service.ts` (stored in `investigation_reports`).
- API: `POST|GET /api/cases/:id/reports`, `GET .../reports/:reportId` (JSON), `GET .../reports/:reportId/pdf`. Audits REPORT_GENERATED and REPORT_EXPORTED. Tests: `reports/report.test.ts` (66 backend tests total).
- UI: "Investigation reports" card in CaseDetail (Generate disabled until an attribution exists; PDF/JSON download via authenticated blob).
- Verified sample PDF visually (2 pages). Old stored S4 result predates the bridge re-score fix; re-run analysis to refresh.
- Limitations: no graph image embedded in PDF; PDF is Latin-1 text only.

### Stage 12 — completed 2026-09-29
- Prisma `SahyogRequest` (+ enums SahyogKind SYNC|DISCLOSURE|FREEZE, SahyogStatus PREPARED|SUBMITTED|ACKNOWLEDGED|FULFILLED), migration `sahyog_requests`.
- `backend/src/sahyog/`: `mock-client.ts` (MOCK reference `MOCK-SAHYOG-XXXXXXXX`, simulated lifecycle; nothing is transmitted), `sahyog.service.ts` (payload built from latest attribution: target VASP + jurisdiction, terminal address, tx trail, reasoning, inference notice; legal reference required to submit; audits SAHYOG_PREPARED / SAHYOG_SUBMITTED_MOCK / SAHYOG_STATUS_UPDATED_MOCK).
- API: `GET|POST /api/cases/:id/sahyog`, `POST .../:requestId/submit` (`{legalReference}`), `POST .../:requestId/advance` (simulated response). Disclosure/freeze need an attributed VASP (422 otherwise); wallet must belong to case (400). Tests in `sahyog/sahyog.test.ts` (69 backend tests total).
- UI: `components/SahyogPanel.tsx` — "PREPARED — not submitted" (blue) vs "<STATUS> · MOCK" (amber), permanent MOCK banner, payload viewer, history, submit needs legal reference.
- Verified S4 in browser; re-ran S4 analysis: now 64 Probable, proximity 24/40 (bridge re-score fix confirmed, evidence sums to confidence).
- Limitations: no real SAHYOG schema (payload shape is our own); no approval workflow beyond authentication.

### Stage 13 — completed 2026-09-29
- `BLOCKCHAIN_PROVIDER` is now `DEMO|LIVE` (env-validated); keys `ETHEREUM_API_KEY`, `BITCOIN_API_KEY`, `TRON_API_KEY`, `SOLANA_API_KEY` optional (blank = unset); overrides `ETHERSCAN_BASE_URL`, `BITCOIN_API_URL`. Demo mode needs nothing.
- `backend/src/blockchain/live/`: `http.ts` (timeout, retry on 429/5xx, no URL/key leakage), `evm-provider.ts` (Etherscan v2: ETHEREUM/BNB/POLYGON), `bitcoin-provider.ts` (Esplora, common-input-ownership heuristic). Tron/Solana: honest 501 in LIVE mode. `registry.ts`: `createProvider(chain, cfg)`, `providerStatus()`, `LIVE_ADAPTERS`.
- `GET /api/admin/providers` + provider table on Admin page (never shows key values). Docs: `docs/blockchain-providers.md`. 79 backend tests (fixture-based, fake fetch).
- Limitations: adapters unverified against live services (no keys here); no EVM internal transfers; Tron/Solana not implemented.

### Stage 14 — completed 2026-09-29
- Hardening: production guard on placeholder `JWT_SECRET`; pino redaction; JSON error handler (malformed 400 / oversize 413); 100kb body limit; login limiter (10/15min/IP), API limiter and shared heavy limiter (analyze/risk/reports/graph), all injectable via `createApp({loginLimit, apiLimit, heavyLimit})`.
- `backend/src/security/security.test.ts` (15 tests): 401s, token tampering/alg:none/expired, deactivated user, admin 403, SQLi/XSS/path payloads, size limits, headers, CORS, 429s. 94 backend tests total.
- `scripts/scan-secrets.sh` (clean; `.env` git-ignored). `docs/security.md` documents controls, npm audit (prisma CLI devDep only, accepted) and limitations (no per-case ACL, JWT in localStorage, no lockout/MFA).

### Stage 15 — completed 2026-09-29
- All 10 critical tests covered (mapping in `docs/testing.md`); 94 backend tests (12 files) + 5 frontend tests (vitest + jsdom + testing-library, `npm test` in frontend). Builds pass.

### Stage 16 — completed 2026-09-29
- Six deterministic scenarios (S1, S1b, S2, S3, S4, S5) already seeded; `backend/src/scenarios.test.ts` locks vasp, hops, class, confidence band, candidate count, bridge link, risk level/indicators, determinism, and evidence-vs-confidence normalisation. `docs/demo-scenarios.md`. 101 backend tests.

### Stage 17 — completed 2026-09-29
- Benchmarked 1k/10k/100k transfers (`backend/src/perf/bench*.ts`); fixed quadratic transfer-dedupe in `buildGraph` (20s -> 105ms at 100k on one edge) and adjacency array copying; graph API now returns edge aggregates + 5-transfer sample. Regression tests in `perf/perf.test.ts` (103 backend tests). `docs/performance.md` lists results, existing indexes/limits, and why caching/async queues were not added.

### Stage 18 — completed 2026-09-29
- Clean-environment run (repo copy without node_modules/.env, fresh DB `sih2_clean`): `npm ci` -> `prisma generate` -> `migrate deploy` -> seed -> build -> `npm start` -> health OK -> login, wallet lookup, graph (bridge link), attribution (S4: Demo Exchange Polygon 64 Probable), risk (MEDIUM 30), report JSON+PDF, SAHYOG mock prepare/submit (MOCK-SAHYOG-...), full audit trail. Frontend `npm ci` + build + tests pass.
- Bugs found and fixed: `npm start` pointed at `dist/index.js` (real path `dist/src/index.js`); compiled server could not find root `.env` (env.ts now resolves from src or dist, `DOTENV_PATH` override); build now uses `tsconfig.build.json` (excludes tests/perf).

### Stage 19 — completed 2026-09-29
- Demo prep: seed (idempotent) creates admin/investigator accounts and one `DEMO Sx` case per scenario. Docs: README (setup, prod run, doc index), `docs/architecture.md` (mermaid diagram + request flow), `api.md`, `database.md`, `sahyog-integration.md`, `demo.md` (setup + 10-step 5-10 min script + talking points), plus existing engine/provider/security/testing/performance/scenario docs.
- ALL STAGES 0-19 COMPLETE. Known limitations are documented in `docs/security.md`, `docs/blockchain-providers.md`, `docs/performance.md`.


### Post-Stage-19 release readiness — completed 2026-09-29
- Clean-environment run (`npm ci`, prisma generate/migrate/seed, build, `npm start`) and API flow (auth, case, wallet, graph, attribution, risk, report JSON+PDF, audit, SAHYOG mock) verified; UI demo flow verified in browser with no console errors.
- Fixes: `View transactions` table added to case page (was missing from the demo flow); evidence table now explains raw points vs normalised confidence; graph edge dedupe made O(1); build/start paths and root `.env` lookup fixed for compiled server.
- Tests run: backend `tsc` clean + vitest 103/103 (14 files); frontend vitest 5/5, `tsc -b` + build pass; `scripts/scan-secrets.sh` clean.
- Limitations: live adapters covered by mocked-fetch tests only; Tron/Solana LIVE = 501; no per-case ACL, MFA, lockout; JWT in localStorage; SAHYOG is MOCK only; claude-mem allowance exhausted (no memory saved).

## Current Status
STAGE 14 — [x] Security hardening
STAGE 15 — [x] Testing
STAGE 16 — [x] Demo data + scenarios
STAGE 17 — [x] Performance
STAGE 18 — [x] Final integration
STAGE 19 — [x] Hackathon demo preparation

## Remaining Verification
- [ ] Live Etherscan adapter (needs real API key; only mocked-fetch tests)
- [ ] Live Bitcoin adapter (Esplora; only mocked-fetch tests)
- [ ] Browser graph performance above 2k nodes (backend graph build benchmarked only)
- [ ] DB/network-inclusive benchmarks

## Release Readiness
- [x] Clean install verified
- [x] Full demo verified
- [x] Critical API flow verified
- [x] Frontend smoke test verified
- [x] Documentation consistency verified

## Next Action
HACKATHON DEMO / OPTIONAL LIVE-PROVIDER VERIFICATION

Final audit 2026-09-29: backend tsc + build clean, vitest 103/103; frontend 5/5 + build; secret scan clean. Demo runs on DEMO data with no external credentials. Known limits unchanged (see Remaining Verification, docs/security.md, docs/performance.md).
