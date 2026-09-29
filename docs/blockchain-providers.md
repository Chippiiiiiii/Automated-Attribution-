# Blockchain data providers

All chain data enters through the `BlockchainProvider` interface (`backend/src/blockchain/types.ts`): balance, native transfers, token transfers, single transaction. Everything downstream (graph, attribution, risk, reports) sees only `NormalizedTransaction`, so providers are interchangeable.

## Modes (`BLOCKCHAIN_PROVIDER`)

| Value | Behaviour |
|-------|-----------|
| `DEMO` (default) | Deterministic synthetic ledger. No keys, no network. Everything in the demo runs on this. |
| `LIVE` | Real explorer APIs via the per-chain adapters below. |

## Adapters

| Chain | Adapter | Key | Notes |
|-------|---------|-----|-------|
| Ethereum, BNB, Polygon | Etherscan API v2 (`EvmExplorerProvider`) | `ETHEREUM_API_KEY` (required; one key serves all three) | External and ERC-20 transfers. Internal (contract-initiated) transfers are **not** fetched. `getTransaction` returns the native part only. |
| Bitcoin | Esplora REST (`BitcoinExplorerProvider`), default blockstream.info | `BITCOIN_API_KEY` (optional, sent as bearer) | UTXO to address-to-address mapping uses the common-input-ownership heuristic (outputs split proportionally over input addresses; change dropped; coinbase skipped). Flagged in `chainDetails.heuristic`. |
| Tron, Solana | **not implemented** | `TRON_API_KEY`, `SOLANA_API_KEY` | `LIVE` mode returns HTTP 501 for these chains rather than pretending. |

Endpoint overrides: `ETHERSCAN_BASE_URL`, `BITCOIN_API_URL`.

## Behaviour and safety

- Requests time out after 10 s and retry (2x, exponential backoff) on network errors, 429 and 5xx; other 4xx fail immediately. Failures surface as HTTP 502 with a generic message: URLs and keys are never logged or returned.
- Missing required key in `LIVE` mode gives HTTP 503 naming the environment variable (not its value).
- `GET /api/admin/providers` (ADMIN) reports mode, active source, adapter, whether each key is configured and readiness, never key values. It is shown on the Admin page.
- Amounts are converted with `Prisma.Decimal` (wei/18, token decimals, sats/1e8), never floats.

## Verification status

Adapters are tested against fixtures shaped like the public API documentation (`backend/src/blockchain/live/live.test.ts`, fake `fetch`). They have **not** been exercised against the live services in this environment (no keys, no network guarantee). Run a smoke test with real keys before relying on them; rate limits on free tiers will limit graph depth.

## Adding a provider

Implement `BlockchainProvider`, return `NormalizedTransaction` (lowercase EVM addresses, decimal-string amounts, ISO UTC timestamps), register it in `createProvider` and `LIVE_ADAPTERS` in `registry.ts`, and add fixture tests.
