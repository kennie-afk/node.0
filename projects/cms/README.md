# Church CMS

Members, giving, double-entry finance, payables, payroll and operations for a church, with
per-church isolation (row-level security) and role-based access.

## Run it (Docker)

```bash
cd cmsbackend
export POSTGRES_PASSWORD=...  APP_DB_PASSWORD=...  JWT_SECRET=...   # JWT_SECRET: 32+ characters
docker compose up -d --build            # console on http://localhost:8080
docker compose up -d --scale api=3 --scale worker=2   # scale out; nothing else to change
```

Demo data and the role picker on the sign-in page:

```bash
DEMO_LOGINS=true docker compose up -d --build web
node tools/seed-demo.mjs                # one account per role, a year of gifts, bills, payroll
```

Demo password is `DemoPass-12345` (override with `DEMO_PASSWORD`). The picker only fills in a seeded
account; the API still checks the password. Never set `DEMO_LOGINS=true` in production.

## Roles

`ADMIN`, `TREASURER`, `APPROVER`, `AUDITOR`, `PASTOR`, `SECRETARY`, `MEMBER`. One matrix in
`cmsbackend/src/auth/permissions.ts` decides who may do what; routes ask for a permission, never a
role, and the console hides what a role cannot use.

## What is built, and what is not

Built and covered by tests:

- Members with every field the record holds, server-side search and filters (status, family, ministry,
  joined range), cursor paging, and a one-request **member profile** (details, family, ministries, groups,
  attendance, giving and care; giving and care appear only to roles that may read them).
- Double-entry ledger with a per-church hash chain, giving and pledges, payables with **real bill
  attachments** (upload, checksum, signed download), payroll, budgets (a live "does this fit the budget" check
  on the bill form), banking, M-Pesa receipts, communications, care, check-in, facilities, volunteers.
- **Audit-chain head export**: every night each church's ledger and audit heads are written to the object store
  (and POSTed to `CHAIN_HEAD_WEBHOOK` if set). `GET /finance/audit/head` and
  `node -r module-alias/register dist/scripts/verify-chain-head.js --church <id> [--file head.json]` check the
  database against an export, which catches a rewrite even when the attacker recomputed every hash.
- **Recurring events** (an RRULE subset: daily/weekly/monthly, interval, BYDAY, COUNT/UNTIL, expanded on read),
  **registration with seat capacity and a waitlist** per occurrence, and **sermon media** uploads.
- A **public giving page** per church at `/give/<slug>` (no sign-in): M-Pesa STK push only, strict validation,
  idempotency, per-IP / per-phone / per-church limits. Money from a phone that matches no member lands in the
  unallocated inbox for the treasurer.

Not built, or not proven:

- **Live Daraja has never been exercised.** M-Pesa, the public giving page included, is tested against the mock
  provider and an injected HTTP client only. Test with a real shortcode before announcing it.
- **No card payments** (needs a provider account). SMS is mock until Africa's Talking is configured.
- **Uploads are buffered in memory** (10 MB attachments, 50 MB sermon media); long videos belong on a video host
  and are linked by URL. No streaming or multipart upload to the bucket.
- The S3 driver is checked against the AWS signing example and a fake `fetch`, **not against a real bucket or MinIO**.
- The chain-head webhook receiver is yours to provide; nothing here verifies that it is outside the database
  owner's reach. Self-service event RSVP (a member registering themselves) is not built; staff register people.
- Numbered pages remain on the smaller lists (events, sermons, announcements, families, ministries, groups,
  users). Members, attendance and contributions page by cursor (`page=` still returns the older numbered shape).

## Deploying

| Target | Where |
|---|---|
| One VM (Compose, Caddy, backups) | `deploy/single-vm/` (see its README) |
| Kubernetes | `cmsbackend/deploy/k8s/` (base plus `kind-dev` and `production` overlays), alerts in `cmsbackend/deploy/alerts/` |
| Render | `render.yaml` |
| Local Docker | the section above |

Secrets are set in the environment only; `cmsbackend/.env.example` lists every key (`POSTGRES_PASSWORD`,
`APP_DB_PASSWORD`, `JWT_SECRET`, `MPESA_CALLBACK_SECRET`, object-store keys, `CHAIN_HEAD_WEBHOOK`). `.env` is git-ignored.

**Provider guard.** With `NODE_ENV=production` the API and worker refuse to start while `MPESA_MODE` or `SMS_MODE`
is `mock`, unless `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true` is set deliberately (a demo). The same guard is why
the public giving page says "Test mode" while the mock is on.

**Object storage.** `OBJECT_STORE_DRIVER=local` needs a persistent volume at `OBJECT_STORE_DIR`; `s3` needs the
`S3_*` keys. Back the bucket or volume up with the database: attachments and chain-head exports live there.

## Tests

```bash
cd cmsbackend && npm test        # API, sqlite by default; TEST_DATABASE_URL runs it on Postgres
cd cms_frontend && npm test
```

More: `cmsbackend/docs/` (architecture, capacity, runbook), `cmsbackend/deploy/` (Kubernetes, alerts).
