# Security and deployment

The portal now includes configurable live connectivity, but supplied BSS URLs are dummy `.invalid` placeholders. Test defaults to the simulator and Production is disabled. Local fixture tests establish proxy behavior; they do not establish compatibility with a real telecom deployment.

## Implemented controls

- Passwords use per-account salt and scrypt hashes. Registration requires approval; disabled, rejected and pending users cannot sign in.
- Sessions use random HTTP-only SameSite cookies and store token hashes. Expiry is configurable. Password changes/reset and account updates revoke sessions. Protected API responses use private/no-store caching.
- Current role/page permissions are enforced server-side. Admin is reserved, retains all access and cannot be removed as the last active administrator. Custom roles independently grant BSS read/write/delete and workspace report access.
- A common BSS authorization gate checks active user status, registered method/path, environment enablement, write controls, subscriber membership, sharing toggle, enabled state and approval. Unknown or ambiguous paths fail closed. Global reads are limited to explicit catalog resources; purchase status uses subscriber-bound receipts.
- Owners and Admin can share registrations. Assigned users cannot re-share or transfer ownership. Changing a Production subscriber target reopens approval when policy requires it.
- All GUI mutations require same-origin requests. Direct writes/deletes require confirmation. Assistant mutations require an expiring owner-bound one-time plan and confirmation; actual management/BSS calls revalidate policy. Passwords are entered separately, never embedded in plans.
- BSS credential values stay in server environment variables. GUI settings store variable names only. Evidence redacts credential keys and masks subscriber numbers; existing purchase CSV exports escape spreadsheet formulas.
- Upstream redirects are not followed. BSS requests have bounded timeouts and a response size cap. Purchases are not retried; polling only uses known request receipts. Unknown outcomes require reconciliation.
- Reset tokens are random, hashed at rest, expire after 30 minutes and can be consumed only once. Admins give the token directly to the account owner; no email delivery or security-question bypass is used.

## TLS and proxy configuration

Production base URLs require HTTPS. `tlsVerify=true` is the default. Supply a trusted certificate using environment `caFile` when needed. The explicitly requested `tlsVerify=false` option bypasses certificate verification **only for that configured BSS environment**; it does not change installation verification or globally disable TLS. Admin changes are audited.

The portal's backend is the local same-origin proxy; browsers never call BSS directly. Server `HTTPS_PROXY`/`HTTP_PROXY` and `NO_PROXY` are respected. Environment authentication supports none, bearer token, or basic credentials by variable reference. Configure port in the server file or `PORT`. Behind HTTPS ingress set `PTAT_PUBLIC_ORIGIN` and `PTAT_SECURE_COOKIES=true`.

For Docker, use the included Compose file with passwords in private `.env`. Put arbitrary BSS/model credential variables in private `.env.portal`, which is loaded only into the portal container; `.env` also contains MySQL root credentials and is not copied wholesale into that container. Native Node startup loads `.env.local`/`.env` from the project root. Both files are ignored by Git and excluded from release ZIPs.

This cloud environment's Docker builds require its existing proxy hostname mapping and trusted CA. `bash infrastructure/docker/build-cloud.sh` passes a temporary CA mount and the resolved proxy host; it preserves normal TLS/checksum verification. No credential value or private certificate is baked into the release image.

## Remaining production gates

The application has not been certified for enterprise production. Validate real BSS response schemas, product/offer/DA mappings, charging units, provisioning states and authentication before real use. Evidence/SQLite/MySQL file encryption, immutable audit storage, backups/restore, distributed throttling, worker queues, observability, load/failover testing and formal security review remain deployment responsibilities. AD/SSO is intentionally deferred as requested.

The simulator includes recognizable demo users. Initial password variables seed accounts once; changing a variable does not rotate existing passwords. The Admin can disable demonstration users and issue resets through the portal. Backup existing data before changing database or deployment configuration.
