# Database

PostgreSQL 16 (docker compose, host port 5433) via Prisma 7 + `@prisma/adapter-pg`. Schema: `backend/prisma/schema.prisma`; migrations in `backend/prisma/migrations`.

| Area | Tables |
|---|---|
| Users / auth | `users` (role ADMIN / INVESTIGATOR, active flag) |
| Cases | `cases`, `case_wallets`, `case_notes`, `wallets` |
| Chain data | `transactions` (unique `chain, txHash, transferIndex`), `wallet_edges` |
| Intelligence | `entities`, `vasps`, `vasp_addresses`, `address_labels`, `bridges` |
| Results | `attributions`, `risk_assessments`, `reports` |
| Integration | `sahyog_requests` (status history JSON) |
| Governance | `audit_logs` (append-only: a trigger rejects UPDATE/DELETE), `app_config` (attribution/risk config) |

Money is stored as decimal (never float); EVM addresses are lowercased. Test DB: `sih2_test` (apply with `DATABASE_URL=... npx prisma migrate deploy`). Indexes and pagination: see `performance.md`.
