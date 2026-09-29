# Blockchain Intelligence & VASP Attribution Engine

Prototype for authorised investigators: given a suspect wallet, trace fund flows across chains and identify the nearest known VASP/service, with transparent, explainable scoring.

> Blockchain attribution is an analytical inference and does not by itself establish beneficial ownership.

**Chains:** Bitcoin, Ethereum, BNB, Tron, Solana, Polygon (DEMO data for all six; LIVE adapters for Ethereum/BNB/Polygon/Bitcoin, unverified without keys).
**Features:** time-consistent graph tracing, configurable attribution scoring with evidence, risk indicators, bridge/cross-chain analysis, case management, append-only audit log, PDF reports, MOCK SAHYOG requests.

## Quick start
```bash
cp .env.example .env            # set JWT_SECRET to a long random string
docker compose up -d --wait     # Postgres on localhost:5433
cd backend && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run dev   # :4000
cd frontend && npm install && npm run dev                                                      # :5173
```
Log in at http://localhost:5173 with `investigator@demo.local` or `admin@demo.local` (password: `DEMO_PASSWORD` in `.env`). Health: http://localhost:4000/api/health.

Production-style run: `cd backend && npm run build && npm start`.

## Demo mode
`BLOCKCHAIN_PROVIDER=DEMO` (default) needs no API keys. All demo entities are labelled DEMO. SAHYOG is `MOCK` only; no real integration is claimed.

## Docs
[Demo guide](docs/demo.md) - [Scenarios](docs/demo-scenarios.md) - [Architecture](docs/architecture.md) - [API](docs/api.md) - [Database](docs/database.md) - [Attribution engine](docs/attribution-engine.md) - [Risk engine](docs/risk-engine.md) - [Providers](docs/blockchain-providers.md) - [SAHYOG (mock)](docs/sahyog-integration.md) - [Security](docs/security.md) - [Testing](docs/testing.md) - [Performance](docs/performance.md)

## Tests
`cd backend && npm test` (103 tests, needs the docker DB and `sih2_test`) - `cd frontend && npm test` - `scripts/scan-secrets.sh`.

Progress log and stage plan: [CLAUDE.md](CLAUDE.md).
