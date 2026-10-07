# Dawa

Pharmacy point of sale, batch-and-expiry stock, dispensing records and a controlled-drug register for Kenyan pharmacies,
multi-tenant (one organisation, many branches), with self-serve signup and its own subscription billing.

Working name. Built 2026-10-03 as one of three revenue bets (see `~/Software_dev/research/niche-2026-10-03/SYNTHESIS.md`).
**Prices, trial length and grace period are PROVISIONAL configuration. Nothing here has had a paying customer.**

## What it does

| Area | What is built (and tested on real Postgres as the RLS-restricted role) |
|---|---|
| Catalogue | Products with GTIN (check digit verified), strength, form, pack, price, reorder level, and the pharmacy's own class: over the counter / prescription / controlled |
| Stock | Batch + expiry per branch; FEFO selling; expired stock is never sold; receiving against supplier invoices; adjustments and expiry write-offs (one batch, or every expired non-controlled batch in one audited action); stock-takes with approval and variance; alerts (expired, expiring in N days, low stock, held) |
| Recall and quarantine | A batch can be quarantined or recalled with a reason (any pharmacist; only a manager releases it). A held batch stays on the books and is never sold, by FEFO or by a scanned serial; it shows in the stock list, alerts and the Batches screen |
| Procurement | Purchase orders (raise, receive in several deliveries against supplier invoices, cancel while untouched), stock returned to a supplier with the credit note it earned, supplier credit notes that reduce what is owed, voiding a wrongly entered invoice (stock and payable reversed, number reusable, refused once money or sales have moved), editing and switching off a supplier |
| Scanning | GS1 element strings (bracketed or raw, `GS` separator as control char, `<GS>` or `\|`) and plain EAN/UPC/GTIN: GTIN, batch, expiry, serial. A pack scanned twice, already sold, or never received is refused |
| Selling | Cash, M-Pesa (typed code, or matched automatically from a till confirmation), credit accounts with limits, price lists, discounts (manager), returns, same-day voids |
| Dispensing | Prescription and controlled items need patient + prescriber; the record is append-only and exportable as CSV |
| Controlled drugs | Receiving, dispensing, adjustments and write-offs need a witness who signs in with their own phone and PIN and is not the actor; running balance per branch; append-only register |
| Money | Day close per cashier (cash counted vs expected), supplier invoices, payments and credit notes, customer ledgers and statements, credit terms, price lists, reports (net sales, margin, movers, expiry loss, stock value). M-Pesa payments that reached a till but matched no sale have their own screen, a dashboard badge, and a claim-to-sale action |
| Your data | CSV exports of sales (line by line), stock by batch, the controlled-drug register, the dispensing log and the trace log |
| Tenancy | Postgres row-level security on every tenant table, forced, app role is not a superuser; the API refuses to start in production if any `org_id` table is unprotected |
| Signup and billing | Phone-code signup, 14-day trial, per-branch monthly plan, invoices, mock M-Pesa payment, suspension to read-only (nothing deleted). Signup codes go out through Africa's Talking SMS when configured (UNVERIFIED, see below), otherwise they are only logged |
| Lists | Every list is paged (`limit`/`offset` with `hasMore` and `next`; the controlled register and customer statements page by entry number). The console walks them with Previous/Next and finds records by server-side search, never by a dropdown of everything. Search text is escaped (`%` and `_` are literal) and backed by trigram indexes. The dispensing export streams the whole log from a database cursor |
| Sign-in protection | Per-account lockout kept in Postgres (survives restarts and works across replicas): after 5 wrong PINs in a row the number waits 30 s, doubling to 15 min; the witness PIN prompt shares it. Optional Redis-backed rate limits so N replicas share one limit |
| Track-and-trace readiness | An **empty** adapter and a log of what a report would contain (see below) |

## What it is NOT (read this)

- **Not connected to the national medicine track-and-trace platforms (NTTS, Practice360, Facility360).** No interface specification, payload or authentication scheme has been published to this project, so none is assumed. `src/ntts/adapter.ts` has one adapter, `NotIntegratedAdapter`, which refuses to send. `ntts_outbox` records what a report would contain, in the same transaction as the stock change, so history can be replayed when a specification exists. The CSV export is Dawa's own format and **is not an official submission**.
- **Not legal classification.** The pharmacy sets each product's class. Dawa does not decide what the law classes a medicine as.
- **No offline mode.** The till needs the network. No receipt printing yet. No stock transfers between branches. No prescription image capture. No patient record beyond the dispensing log. Returning serial-numbered packs to a supplier, and voiding an invoice whose delivery held serial-numbered packs or a controlled drug, are refused: those corrections go through a credit note or a witnessed adjustment.
- **SMS is written but UNVERIFIED.** `NOTIFY_MODE=africastalking` sends through Africa's Talking's bulk SMS HTTP API (`POST /version1/messaging`, `apiKey` header, form body). It was written from their public documentation and tested only against a stub HTTP server: no account, sender id, sandbox call or delivery report has been checked, and the status codes it treats as accepted (100, 101, 102) are from memory of that documentation. Until one real code has arrived on a real phone, treat it as unproven; the default `NOTIFY_MODE=mock` only logs, and an operator relays a code with `npm run admin -- messages`. No WhatsApp provider.
- **Live M-Pesa is unverified.** The Daraja confirmation endpoint (`POST /v1/mpesa/<secret>/confirmation`) is implemented and tested with synthetic confirmations in Daraja's published C2B shape. Nobody has registered the URL with Safaricom or received a real confirmation. The secret in the path is our own authentication; no Daraja signature scheme is assumed.
- **No per-patient export, no independent security review, no data-protection impact assessment.** Dispensing records are health data; that obligation has not been checked. A backup/restore drill exists (below) and passed on a test database; it has not been run on a real deployment.
- **Redis rate limiting is verified against a real Redis 7 in tests only**; nothing runs it in production yet. Without `REDIS_URL` the per-request limits are per process (the sign-in lockout is not affected).
- **No load test.** Designed for a pharmacy or a small chain, not for scale. Offset paging is used for most lists; at a very large catalogue the deep pages get slower.

## Run it

```
cp .env.example .env     # then replace every placeholder with generated values
docker compose up -d --build
# console http://localhost:3700   api http://localhost:4200
```
Sign up at `/signup`; read the code with `docker compose exec api node dist/admin/cli.js messages`. "Get started" can load a labelled sample branch (never billed, hidden not deleted).

## Test it

```
docker run -d --name dawa-pg -e POSTGRES_USER=dawa -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=dawa_test -p 55440:5432 postgres:16-alpine
export DATABASE_URL=postgres://dawa_app:app-password-123@localhost:55440/dawa_test \
       DATABASE_MIGRATION_URL=postgres://dawa:ownerpw@localhost:55440/dawa_test DAWA_APP_PASSWORD=app-password-123 \
       JWT_SECRET=test-secret-test-secret-test-secret-1234 MPESA_CALLBACK_SECRET=mpesa-secret-1234567 \
       NODE_ENV=test DAWA_INTEGRATION=1 SIGNUP_RESEND_COOLDOWN_SECONDS=0 API_RATE_LIMIT_PER_MINUTE=100000
npm run migrate && npx vitest run          # 107 tests without Redis (110 with it), all against real Postgres as the restricted role
node scripts/isolation-check.mjs           # against a running compose stack: 18 live two-tenant checks

# the shared rate-limit store is only tested when a Redis is given:
docker run -d --name dawa-redis -p 56380:6379 redis:7-alpine
REDIS_TEST_URL=redis://127.0.0.1:56380 npx vitest run
```
Run the isolation script after `docker compose up`; it provisions two pharmacies through the operator CLI. Turning RLS off on one table makes 7 of its checks fail and the API refuse to start - that is the control.

## Operating it

**Unclaimed M-Pesa money.** A confirmation for a till nobody has registered is kept in `mpesa_unclaimed` (the app role can only add to it). Once the pharmacy has entered its till number:
```
npm run unclaimed:list                              # what is waiting (add --all to include assigned ones)
npm run unclaimed:assign <mpesa code> <org id> [branch id]
```
It is moved into that organisation's till as a normal confirmation: matched to a pending sale if exactly one fits, otherwise it appears under **M-Pesa** in the console for a manager to put against a sale. Running it twice changes nothing, and a payment already given to one organisation cannot be given to another. Inside the compose stack: `docker compose exec api node dist/admin/cli.js unclaimed:list`.

**Sign-in lockout and rate limits.** `LOGIN_LOCKOUT_THRESHOLD` (5), `LOGIN_LOCKOUT_BASE_SECONDS` (30), `LOGIN_LOCKOUT_MAX_SECONDS` (900). The lock is on the phone number, so it also locks out the real owner for up to 15 minutes if someone guesses at their number: that is the trade for stopping a six-digit PIN being guessed across addresses and replicas. An operator can clear one with `DELETE FROM login_lockouts WHERE phone = '...'` as the migration role. `REDIS_URL` (optional) puts the per-minute request limits in a shared Redis; if Redis is unreachable requests are counted in-process rather than refused. The API logs a warning at start-up in production when it is unset.

**Production deployment.** `docker-compose.yml` is the demo/local path (mock billing allowed, Postgres on localhost, API and console published). For a real host:
```
# .env additionally needs: DAWA_DOMAIN, BILLING_SHORTCODE, REDIS_PASSWORD  (and optionally NOTIFY_MODE=africastalking, AT_USERNAME, AT_API_KEY, AT_SENDER_ID)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
The override turns billing live (and forces `BILLING_ALLOW_MOCK_IN_PRODUCTION` off), publishes nothing except Caddy on 80/443, adds Redis, and sets restart policies and log rotation. **TLS:** `deploy/Caddyfile` has Caddy obtain and renew a certificate for `DAWA_DOMAIN` automatically (the name must resolve to the host and ports 80/443 must be open for the first issue). Only the console and `/v1/mpesa/*` (the URL Safaricom posts to) are exposed; the console reaches the API on the compose network. Not run end to end on a real host: the override was checked with `docker compose config` and the images' build is unchanged.

**Backups.** `scripts/backup.sh [dir]` writes a consistent `pg_dump -Fc` with a checksum and keeps the newest 14. `scripts/restore.sh <dump> <new db name>` restores into a new database and never overwrites one. `scripts/backup-drill.sh [dir]` does both and then proves the copy: every table has the same row count as live, the same migrations are recorded, row-level security is still forced on every tenant table, the restricted role still cannot bypass it and sees no tenant rows without a tenant selected. Run it on a schedule you can defend, and copy dumps off the machine (they hold health information and PIN hashes; encrypt them). With the production override: `DAWA_PG_EXEC="docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres" scripts/backup-drill.sh`. The drill passed against the test database (9 migrations, 44 tables); it has not been run against a production-sized database, and a restore's time on one is unknown.

## Billing (PROVISIONAL)

`BILLING_PRICE_FIRST_BRANCH_KES=4500`, `BILLING_PRICE_EXTRA_BRANCH_KES=3500` (2-5 branches; 6+ is an agreed per-branch price via `npm run admin -- billing:price`), `BILLING_TRIAL_DAYS=14`, `BILLING_SUSPEND_AFTER_DAYS=14`. Sample branches and archived branches are never billed. `BILLING_MODE=mock` lets an owner simulate paying and is refused in production unless `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`. For a real deployment set `BILLING_MODE=live` with a `BILLING_SHORTCODE`: confirmations on that shortcode are matched to the invoice by account number; unmatched ones are kept for `billing:assign`. Until Safaricom registration is done, record payments by hand: `npm run admin -- billing:pay <org id> <mpesa code> <KES>`.

A suspended account is read-only (writes get HTTP 402) but keeps every record, and M-Pesa confirmations are still recorded against sales. Paying reopens it immediately.

## Layout

Rate limits are per signed-in person (and per phone number for signup and sign-in), never per IP address, because every request from the console reaches the API from the console's one address.

`src/` API (`api/` routes, `sales/`, `inventory/`, `procurement/`, `gs1/`, `stocktake/`, `close/`, `payables/`, `customers/`, `reports/`, `ntts/`, `onboarding/`, `billing/`, `signup/`, `mpesa/`, `ratelimit/`, `notify/`), `migrations/` (append-only SQL, 0001-0009), `apps/console/` (Next.js), `scripts/` (`isolation-check.mjs`, `backup.sh`, `restore.sh`, `backup-drill.sh`), `deploy/Caddyfile`, `docker-compose.prod.yml`, `tests/`, `docs/` (`ARCHITECTURE.md`, `FIRST-PHARMACY.md`, `go-to-market/`).
