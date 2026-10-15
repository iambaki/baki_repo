# Run and test on your laptop

## Windows: Node.js and MySQL

1. Install Node.js 24 or newer. Install MySQL 8.4, or install Docker Desktop to run the included MySQL service.
2. Download the GitHub ZIP and extract it. Open the folder containing `package.json` (usually `baki_repo-main`). Click the Explorer address bar, type `cmd`, and press Enter.
3. Run `copy .env.example .env`, then `notepad .env`. Fill in `MYSQL_PASSWORD` and `PTAT_ADMIN_PASSWORD` using passwords you choose. For Docker MySQL also fill in `MYSQL_ROOT_PASSWORD`. Leave the dummy BSS environment URLs in simulator mode.
4. If using Docker, run `docker compose up -d mysql`. If using an existing MySQL installation, create a database named `ptat` and grant the configured `MYSQL_USER` access to it. The portal creates its tables on first login; it does not create the MySQL server or database itself.
5. Run `npm ci`, then `npm run dev`. Open `http://localhost:3000` in your browser.
6. Sign in as `admin@ptat.local` with your initial `PTAT_ADMIN_PASSWORD`. Existing accounts retain their previous passwords after migration.

On macOS/Linux use `cp .env.example .env` in step 3. No Git installation is required for the ZIP route.

## Existing MySQL database setup

Run the following as a MySQL administrator, replacing the password placeholder and matching the values in your private `.env` file:

```sql
CREATE DATABASE IF NOT EXISTS ptat CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'ptat'@'localhost' IDENTIFIED BY 'YOUR_CHOSEN_PASSWORD';
GRANT ALL PRIVILEGES ON ptat.* TO 'ptat'@'localhost';
```

Do not run `DROP DATABASE` to upgrade. Back up existing databases before upgrading. Keep your original `.data/ptat.sqlite` in the project: on first MySQL startup the portal copies its users and documents into MySQL without deleting the source. Existing target records are preserved. After migration, sign in again because old sessions are intentionally invalidated.

## Immediate simulator-only compatibility option

If you do not have MySQL yet, set `PTAT_DB_DRIVER=sqlite` in your private `.env`. This is an explicit local compatibility option, while MySQL remains the intended database. Use a fresh data directory if you want an empty sandbox; do not delete existing `.data` files to troubleshoot.

## Configurable port and startup directory

Set `PORT=3100` in `.env` or edit `port` in `server/portal.config.json`. Open the corresponding port in your browser. The launcher loads `.env.local`, `.env`, and server configuration from the project root, even when invoked from another directory:

```text
node C:\path\to\baki_repo-main\scripts\portal.mjs dev
```

`PTAT_CONFIG_FILE` supports an absolute path or a path relative to the project root. Environment variables already injected by the operating system take precedence over `.env` files.

## Functional walkthrough

- Administration → Users: create a user, or register from the sign-in screen and approve the request.
- Administration → Roles: create a role, configure page names and BSS permissions, then assign it to the user. Admin is reserved.
- Test MSISDNs: edit a demonstration number; assign a second active user. Sign in as that user and verify shared access. Disable sharing centrally and verify access is denied immediately.
- API portal: choose Test → Subscription balances, enter subscription `1001`, and execute. Try direct path `/subscriptions/1001/balances`. Unknown/unassigned subscriber paths must fail.
- Bundle verification: paste `01900000001,Bundle1,1001|1002|1003,101#V|102#V|103#S`. The simulator returns OK. Replace offer `1003` with `9999` or DA `101#V` with `101#D` to see NOT OK.
- Subscriber 360: search `01900000001` or `1001`; inspect the summary and tabs.
- Product explorer / Batch Report: use `01900000001,01900000002`, product `Bundle1`, and the expected offers/DAs. Only the selected product's associated records are shown.
- AI BSS Assistant: type `Check balances for 01900000001`, review the plan, tick confirmation and execute. Try `Purchase P123 for 01900000001` for scheduled-request polling. Admins can try `disable sharing`; no configuration changes until confirmation.
- My account changes a password and revokes existing sessions. Recovery works through an administrator-issued reset token; no email service is needed.

## Automated checks

```sh
npm test
npm run build
npm run typecheck
```

With the portal running, `npm run test:http` checks the original purchase workflow. `npm run test:enterprise` checks the new MySQL/RBAC/sharing flows and creates clearly identified fixtures; run it against a test database. Set `PTAT_TEST_URL` if the port differs from the script default. Browser tests require Chromium: `npm run test:e2e` and `npm run test:enterprise:e2e`; set `PTAT_CHROMIUM_PATH` when necessary.

## Full container option

After filling `.env`, run `docker compose --profile portal up --build`. Named volumes retain MySQL and portal data. Do not use `docker compose down -v` when you need to retain that data. The Node application runs as a non-root user. For a cloud HTTPS proxy, the documented cloud build helper supplies the existing trusted CA without disabling certificate checks.

## Live BSS / model setup

All supplied BSS URLs use `.invalid` as requested. For live execution, an Admin edits the environment's base URL, switches mode, enables it, and supplies credential **variable names**. Put actual values in the server `.env`, then restart the process. Production requires HTTPS. Certificate verification defaults to enabled; the requested environment-specific bypass is `tlsVerify=false`. Prefer installing the correct CA using `caFile` where possible.

The assistant defaults to deterministic rules; no paid model service is required. To use a model, configure an approved HTTPS OpenAI-compatible chat-completions endpoint, model name and token variable in Administration. The returned plan is validated and requires confirmation. Real BSS schemas, units and offer/DA associations still require deployment validation before real subscriber use.
