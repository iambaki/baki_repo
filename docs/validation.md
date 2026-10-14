# Validation evidence

Validated on 2026-10-06 in the cloud workspace with Node.js 24 and Next.js 16.3.8.

- Frozen dependency installation (`npm ci`) passed using the writable workspace cache.
- The saved install script was executed in full: optimized build, 12 engine tests (12 passed; no skips), and TypeScript checks passed.
- Authenticated HTTP smoke: 23 assertions passed against the native development/production workflow and the non-root Docker runtime. Covered login, cross-origin rejection, subscriber ownership, execution, failed balance comparison, replay rejection, CSV masking, prompt planning, report permissions, audit persistence and logout.
- Chromium UI smoke passed: login, explicit plan review, successful batch verification, evidence inspection, CSV download, deterministic prompt purchase, navigation, CSV import, direct prompt shortcut, Escape dismissal and responsive layout. No browser page errors. Desktop (1440px) and mobile (390px) screenshots were inspected; artifacts are in `/tmp/ptat-evidence`.
- Production dependency audit reported zero known vulnerabilities. This is a package-advisory check, not a security certification.
- Docker build and non-root container startup passed. Cloud-specific build steps preserve TLS verification through an ephemeral trusted CA mount and reuse the platform proxy's DNS mapping. The temporary runtime test container was removed after validation.
- Local formatting and Git whitespace checks passed. GitHub Actions configuration was created but has not executed remotely.
- `install_script` and `start_skill` were confirmed saved as an environment draft. Publication and fresh-task restoration have not been validated.

Live BSS contract/functional tests are **unrun**: no live adapter, base URL, deployed authentication or credentials are configured. Expected entitlements and scheduled transaction states in this release are simulated. SSO, MySQL, Redis, NestJS extraction and real model integration are future milestones.
