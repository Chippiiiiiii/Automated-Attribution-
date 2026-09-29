# SAHYOG integration - MOCK ONLY

No real SAHYOG API is assumed or contacted; nothing leaves the server. `SAHYOG_MODE=MOCK` is the only mode.

Lifecycle: **PREPARED** (local draft, not submitted) -> **SUBMITTED / ACKNOWLEDGED / FULFILLED** (all simulated; the UI shows "<STATUS> - MOCK" and a permanent banner; reference `MOCK-SAHYOG-XXXXXXXX`).

Rules: disclosure/freeze requests need an attributed VASP (422) and a wallet in the case (400); submitting needs a legal reference (409 if already submitted). Payload (target VASP + jurisdiction, terminal address, transaction trail, reasoning, inference notice) is our own shape. Audit: `SAHYOG_PREPARED`, `SAHYOG_SUBMITTED_MOCK`, `SAHYOG_STATUS_UPDATED_MOCK`.

To wire a real service later: replace `backend/src/sahyog/mock-client.ts` with a client implementing `submit` / `status` against the official spec; keep the audit calls and the human legal-reference gate.
