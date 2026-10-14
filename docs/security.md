# Security and deployment status

This is a local simulated UAT foundation. It is not enterprise production-ready and does not execute real purchases.

Implemented: HTTP-only same-site sessions, eight-hour expiry, salted scrypt password hashes, account failed-login throttling, same-origin mutation checks, server-side role and ownership checks, strict plan schema, 50-subscriber cap, one-time transactional execution, masked subscriber evidence, formula-safe CSV, and operation audit events.

Limitations: demo accounts, no SSO/LDAP/password recovery, no distributed rate limiting, local SQLite unencrypted storage, no evidence retention service, no tamper-proof audit, synchronous simulator instead of durable workers, no real BSS auth/adapter, no secrets vault, no deployment security certification. Evidence/report APIs are accessible only to authorized sessions; Testers cannot read other users' runs. Test Leads and Auditors have workspace report visibility in this single demo tenant. MSISDN registration is a demo self-registration flow; real ownership must be independently verified by an administrator.

The prompt interpreter is a limited deterministic parser, not an LLM. It only constructs registered product purchase plans with explicit numbers. It cannot call APIs. The execution layer still validates the generated plan and requires explicit user execution. If a future model uses uploaded documents, treat every instruction found in those documents as untrusted data.

## Local container

Build with Docker and run with a persistent `/app/.data` volume. Supply `PTAT_DEMO_PASSWORD` using your local environment/secret mechanism before initial database creation. Runtime password hashes are seeded only once. Use HTTPS ingress and `PTAT_SECURE_COOKIES=true` outside plain HTTP local development. Proxy routing must preserve the public origin for same-origin checks.

```sh
docker build -t ptat .
docker run --rm -p 3000:3000 -v ptat-data:/app/.data -e PTAT_DEMO_PASSWORD ptat
```

No real deployment was performed. MySQL, Redis and NestJS extraction are next milestones rather than unused services included in a demo compose file.

For this cloud environment's HTTPS proxy, use the existing trusted CA as a temporary build mount; do not disable TLS or package verification:

```sh
bash infrastructure/docker/build-cloud.sh
```

This uses an existing public trust certificate without copying it into the image. The Dockerfile's CA mount is optional on networks using public certificate authorities. Build arguments use Docker's special proxy behavior, which excludes proxy values from normal image history/cache.

The cloud helper also resolves the existing proxy hostname and supplies that mapping to BuildKit. This fixes container-build DNS without changing application routes or the environment network policy.
