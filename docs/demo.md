# Demo guide (5-10 minutes)

## Setup (2 minutes, once)
```bash
cp .env.example .env            # set JWT_SECRET to any long random string
docker compose up -d --wait
cd backend && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run dev
cd frontend && npm install && npm run dev      # http://localhost:5173
```
Accounts (DEMO): `investigator@demo.local` and `admin@demo.local`, password = `DEMO_PASSWORD` from `.env` (default `demo-password-change-me`). The seed creates one case per scenario (see `demo-scenarios.md`).

## Script
1. **Framing (30 s)** - amber DEMO banner: synthetic data, no keys, SAHYOG is MOCK. Read the disclaimer in the footer: attribution is inference, not identity.
2. **Dashboard (30 s)** - case statuses, risk chart, latest attributions.
3. **Direct deposit, S1 (1 min)** - open the S1 case, *Run attribution*: Demo Exchange Alpha, 1 hop, Confirmed ~97. Walk the evidence table: each factor's points and its plain-language reason. Use *View transactions* to show the raw normalised transfers (hash, from, to, amount, time, status). Then *View graph*: suspect (red), VASP (green), attribution path highlighted.
4. **Two-hop, S2 (1 min)** - intermediary shown in the path; confidence drops with distance. Explain time-consistency (funds cannot leave before they arrive).
5. **Mixer, S3 (1 min)** - mixer node (purple), confidence penalised, *Score risk* -> HIGH with the triggered indicator.
6. **Cross-chain bridge, S4 (1.5 min)** - Ethereum to Polygon via bridge; bridge link banner, score 64 Probable (bridge penalty), risk MEDIUM.
7. **Ambiguity, S5 (1 min)** - three candidate VASPs ranked; reasoning explains why the winner is not certain.
8. **Report (1 min)** - *Generate report*, download PDF: evidence, path, risk, audit trail, limitations.
9. **SAHYOG mock (1 min)** - prepare a Disclosure request (PREPARED, not submitted), enter a legal reference, submit -> "SUBMITTED - MOCK", advance status. Point out the audit trail.
10. **Admin (30 s, as admin)** - edit attribution thresholds/weights live, provider status card (DEMO/LIVE, no key shown); re-run S1 and show the classification change.

## Talking points
Transparent scoring (all weights configurable), append-only audit log, honest limits (`security.md`, `blockchain-providers.md`), 103 backend + 5 frontend tests, clean-environment run verified, 100k-transfer graph in ~0.2 s (`performance.md`).

## If something breaks
`curl localhost:4000/api/health` should show `database: connected`. Re-run the seed (idempotent). A stale case from before an engine change: re-run the analysis.
