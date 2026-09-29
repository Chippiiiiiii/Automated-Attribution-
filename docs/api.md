# API

Base `/api`. JSON. All routes except `/health` and `/auth/login` need `Authorization: Bearer <jwt>`. Errors: `{ "error": "message" }` (400 validation, 401, 403, 404, 409, 413, 422, 429, 501).

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | DB status, provider mode, SAHYOG mode |
| POST | `/auth/login` | `{email, password}` -> `{token, user}`; 10/15 min/IP |
| GET | `/auth/me` | current user |
| GET / POST | `/cases` | list / create `{title, summary?}` |
| GET | `/cases/summary` | dashboard aggregates |
| GET | `/cases/:id` | case with wallets and notes |
| POST | `/cases/:id/wallets` | `{chain, address, note?}` |
| POST | `/cases/:id/notes` | `{body}` (max 5000 chars) |
| PATCH | `/cases/:id/status` | `OPEN / ANALYZING / REVIEW / CLOSED` |
| POST | `/cases/:id/analyze` | `{walletId, maxHops?(1-6), from?, to?}` -> attribution |
| GET | `/cases/:id/attributions` | stored attributions |
| POST / GET | `/cases/:id/risk` | score wallet / list scores |
| GET | `/cases/:id/audit` | audit trail |
| POST / GET | `/cases/:id/reports` | generate / list |
| GET | `/cases/:id/reports/:reportId` , `/pdf` | JSON / PDF download |
| GET / POST | `/cases/:id/sahyog` | list / prepare `{kind: SYNC/DISCLOSURE/FREEZE, walletId?}` |
| POST | `/cases/:id/sahyog/:requestId/submit` | `{legalReference}` - MOCK submission |
| POST | `/cases/:id/sahyog/:requestId/advance` | simulated SAHYOG response (MOCK) |
| GET | `/wallets/:chain/:address` , `/transactions` | summary / transfers (`limit` <= 1000, `from`, `to`) |
| GET | `/graph/:chain/:address` | `maxHops, direction, minAmount, from, to, token` -> nodes (with intel), edges (aggregates + 5-transfer sample), bridgeLinks |
| GET | `/intel/vasps` , `/intel/:chain/:address` | VASP directory / address lookup |
| GET | `/admin/config`, `/admin/providers` | ADMIN only |
| GET / PUT | `/admin/attribution-config`, `/admin/risk-config` | ADMIN only, validated |

Chains: `BITCOIN ETHEREUM BNB TRON SOLANA POLYGON`.
