# PTAT — BSS API Testing & Verification Portal

A configurable Next.js/TypeScript portal for business BSS testing, with MySQL persistence, approved API operations, subscriber sharing, batch product/offer/DA verification, Subscriber 360 and a controlled assistant.

**Start here:** [Laptop setup and testing](docs/local-testing.md). Download the GitHub ZIP, extract it, open the folder containing `package.json`, and follow the Windows steps. No Git installation is required.

## Quick start

Requires Node.js 24+ and MySQL 8.4 (or Docker Desktop for MySQL).

1. Copy `.env.example` to `.env`; fill `MYSQL_PASSWORD`, `PTAT_ADMIN_PASSWORD`, and `MYSQL_ROOT_PASSWORD` when using Docker.
2. Run `docker compose up -d mysql`, or configure an existing MySQL database/user.
3. Run `npm ci` and `npm run dev`.
4. Open port 3000 and sign in as `admin@ptat.local` with your initial `PTAT_ADMIN_PASSWORD`.

An explicit local-only SQLite compatibility option is available with `PTAT_DB_DRIVER=sqlite`. Existing password hashes and data are preserved during additive MySQL migration. Keep your original `.data/ptat.sqlite`; do not delete it to upgrade. Default demonstration accounts (`lead@ptat.local`, `tester@ptat.local`, `auditor@ptat.local`) remain available. In development only, unset initial password variables fall back to `UatDemo!2026`. Existing passwords are never silently changed by editing environment variables.

## Delivered capabilities

- Configurable Test and Production environments; same-origin BSS proxy, HTTPS, per-environment certificate verification/bypass, CA file, credentials by environment-variable reference, timeouts and write controls.
- Registered API forms with parameters, filters and bodies; direct relative paths; configurable business-view columns and raw evidence.
- MySQL accounts, sessions, custom roles, per-page and read/write/delete permissions, account approval, admin-created users, password changes and administrator-issued one-time reset tokens without email.
- MSISDN names, subscription/contract IDs, owners, assigned users, enabled/approval state and remarks. Owners and admins can share registrations; central settings govern sharing and Production approval.
- Bundle CSV/text verification for all expected products, offers and DA units, with OK/NOT OK, missing/mismatched detail, saved reports and evidence exports.
- Subscriber 360 with a left summary and detail tabs; product-specific explorer; comma-separated Batch Report inputs.
- Business/admin assistant plans using the same authorization and execution services. Offline rules mode is usable immediately; an optional approved OpenAI-compatible model endpoint can generate validated plans. Changes require explicit confirmation; credentials are collected separately.
- Original simulated purchase scenarios, seven-entitlement comparisons, dashboards and CSV exports retained.
- Configurable port and project-relative startup configuration independent of the calling directory.

## What is simulated

As requested, BSS URLs are dummy `.invalid` placeholders. Test defaults to simulator mode and Production starts disabled. Simulated offer/DA association fields are configurable mappings, not assertions about deployed BSS schemas. The current registered API subset follows the uploaded 2019 Qvantel document; deployment-specific endpoints such as devices remain explicitly unavailable until configured.

Do not treat a successful simulated run as proof of live telecom integration. Real endpoints, authentication, response mappings and charging semantics need validation against the actual UAT deployment. AD/SSO is intentionally omitted for now. Distributed workers, HA, campaigns/maker-checker, tamper-proof audit and PDF/XLSX reports are future extensions.

## Checks

```sh
npm test
npm run build
npm run typecheck
npm run format:check
```

With a test portal running: `npm run test:http`, `npm run test:enterprise`, `npm run test:e2e`, and `npm run test:enterprise:e2e`. Set `PTAT_TEST_URL` to its address and `PTAT_CHROMIUM_PATH` to an installed Chromium executable if required. Integration tests create clearly identified fixtures; use an isolated test database.

See the [requirement cross-check](docs/requirements-matrix.md), [BSS contract notes](docs/bss-contract.md), [architecture](docs/architecture.md), [deployment/security notes](docs/security.md), and [validation evidence](docs/validation.md).
