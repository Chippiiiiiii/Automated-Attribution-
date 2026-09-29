# Security

## Controls implemented
- **Authentication**: JWT (HS256, 8h). The user is re-loaded on every request, so deactivating an account revokes access immediately. `alg:none`, wrong-secret, expired and wrong-algorithm tokens are rejected.
- **Authorization**: roles ADMIN / INVESTIGATOR. Admin endpoints (`/api/admin/*`) are ADMIN-only.
- **Input validation**: zod on all bodies/params/queries (chains, addresses, hop limits, note length, UUIDs). Prisma parameterised queries only - no raw SQL.
- **Rate limits** (per IP): login 10 / 15 min; API 300 / min (configurable); heavy endpoints (analyze, risk, reports, graph) stricter shared limiter. 429 returns JSON.
- **HTTP hardening**: helmet (CSP, nosniff, frame-options), `x-powered-by` off, CORS restricted to `CORS_ORIGIN`, 100 kB JSON body limit (413), malformed JSON -> 400.
- **Errors**: no stack traces or internals returned; login gives identical errors for unknown user / wrong password.
- **Logging**: pino with redaction of `authorization`, `cookie`, `password`, `token`, `passwordHash`.
- **Audit**: append-only `audit_logs` (DB trigger blocks UPDATE/DELETE).
- **Secrets**: only from env; startup fails in production if `JWT_SECRET` is still the `.env.example` placeholder. `scripts/scan-secrets.sh` scans the tree; `.env` is git-ignored.
- **Provider safety**: outbound HTTP has timeouts, retries, and never logs URLs containing API keys.

## Verification
`backend/src/security/security.test.ts` (15 tests): 401 on all protected routes, token tampering, deactivated user, 403 on admin routes, SQLi/XSS/path payloads, size/shape limits, malformed/oversized JSON, headers, CORS, and rate limiting (429).

## Dependency audit
`npm audit`: all findings are in the `prisma` CLI (a devDependency, not shipped at runtime). Accepted; revisit on Prisma upgrade.

## Known limitations (documented, not hidden)
- **No per-case ACL**: any authenticated investigator can view all cases (single-agency model). Multi-agency deployments need case-level ownership.
- **JWT in localStorage**: exposed to XSS if one is ever introduced; mitigated by CSP, React escaping, and JSON-only API responses. Production should move to httpOnly cookies + CSRF protection.
- **No account lockout / MFA** beyond the per-IP login limiter.
- Demo credentials come from seed data; change `DEMO_PASSWORD` and `JWT_SECRET` outside demos.
- Live provider adapters are unverified against real services.
