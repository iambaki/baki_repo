# PTAT — Product Testing & Automation Toolkit

A runnable foundation for a business BSS UAT portal. This release deliberately uses a **simulated BSS adapter** and synthetic products/subscribers. It makes no external telecom calls and is not approved for production or real subscriber testing.

## Run

Requires Node.js 24+ (SQLite uses `node:sqlite`).

```sh
cd /workspace/baki_repo
npm ci --cache /workspace/.npm-cache
npm run dev
```

Open port 3000 in your development environment. Accounts:

| Role      | Email              | Scope                                            |
| --------- | ------------------ | ------------------------------------------------ |
| Test Lead | lead@ptat.local    | Own subscribers; view workspace runs and audit   |
| Tester    | tester@ptat.local  | Own subscribers, runs and audit                  |
| Auditor   | auditor@ptat.local | Read workspace results and reports; no execution |

Development-only initial password: `UatDemo!2026`. Set `PTAT_DEMO_PASSWORD` **before first startup** to override it. Existing password hashes are retained: changing the variable does not change an already-created account. Production-mode startup requires this variable, but does not make this demo suitable for enterprise production.

## Working workflows

- Login: salted scrypt hashes, opaque eight-hour HTTP-only sessions, failed-login throttling, same-origin mutation checks.
- Dashboard, product expectations, documented API registry, local audit and environment controls.
- Register test MSISDNs and enforce active status, ownership, environment, and registered products server-side.
- Structured plans and deterministic business prompt parsing; both require plan review and explicit execution.
- CSV/text batch import selecting existing owned subscribers (50 max). Import is validated all-or-nothing. XLSX is not implemented.
- Purchase → simulated scheduled request → completion → seven entitlement comparisons → PASS/FAIL/ERROR/PARTIAL.
- Deliberate balance mismatch and purchase-error scenarios demonstrate failure detection.
- Persisted masked API evidence, per-subscriber results, and CSV export (with spreadsheet formula escaping).
- Transactional one-time execution; no automatic purchase retries.

Data lives in ignored `.data/ptat.sqlite` (WAL files included). Set `PTAT_DATA_DIR` to relocate it. Each simulated run begins with a fresh balance of 1,000 BDT; it does not modify a real or shared subscriber balance. Restricted number `01900000005` must be rejected. Test Lead owns 001–003, Tester owns 004. The synthetic prefix does not imply a real operator assignment.

## Validate

```sh
npm test
npm run typecheck
# Supply a non-default password for the production-mode build/runtime.
PTAT_DEMO_PASSWORD='<your local secret>' npm run build
# With a dev or production server running:
node tests/http-smoke.mjs
```

Smoke tests create persisted test runs and audit events. Use a separate `PTAT_DATA_DIR` when testing clean-room startup. Configure `PTAT_SECURE_COOKIES=true` when served over HTTPS; HTTP-only local development requires it false. No secret belongs in Git or in a build artifact.

## Architecture and limits

Next.js + React + TypeScript provides the UI and backend routes in this initial runnable vertical slice. The engine is independent of HTTP; the approved-operation registry and contract notes define the future BSS adapter boundary. SQLite is local development persistence. See [architecture](docs/architecture.md), [BSS contract notes](docs/bss-contract.md), and [security and deployment](docs/security.md).

NestJS services, MySQL migrations, Redis jobs, actual LLM integration, SSO, secret manager, PDF/XLSX reporting, campaigns, maker-checker approvals, immutable audit storage, and live BSS adapters are **not yet implemented**. A seven-phase enterprise product cannot responsibly be labeled complete from this foundation. These are the next implementation milestones.

Browser validation (Chromium required): `npm run test:e2e`. Set `PTAT_CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. `npm run test:http` verifies the authenticated HTTP contract. Both default to port 3000 and honor `PTAT_TEST_URL` and `PTAT_DEMO_PASSWORD`. Screenshots are written outside the repository to `/tmp/ptat-evidence`.

Behind HTTPS ingress set `PTAT_PUBLIC_ORIGIN` to the exact public origin (for example `https://ptat.company.example`) along with secure cookies. The public origin is a non-secret configuration value; it must match the browser's Origin header.
