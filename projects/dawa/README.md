# Dawa

Pharmacy point of sale, batch-and-expiry stock, dispensing records and a controlled-drug register for Kenyan pharmacies,
multi-tenant (one organisation, many branches), with self-serve signup and its own subscription billing.

Working name. Built 2026-10-03 as one of three revenue bets (see `~/Software_dev/research/niche-2026-10-03/SYNTHESIS.md`).
**Prices, trial length and grace period are PROVISIONAL configuration. Nothing here has had a paying customer.**

## What it does

| Area | What is built (and tested on real Postgres as the RLS-restricted role) |
|---|---|
| Catalogue | Products with GTIN (check digit verified), strength, form, pack, price, reorder level, and the pharmacy's own class: over the counter / prescription / controlled |
| Stock | Batch + expiry per branch; FEFO selling; expired stock is never sold; receiving against supplier invoices; adjustments and expiry write-offs; stock-takes with approval and variance; alerts (expired, expiring in N days, low stock) |
| Scanning | GS1 element strings (bracketed or raw, `GS` separator as control char, `<GS>` or `\|`) and plain EAN/UPC/GTIN: GTIN, batch, expiry, serial. A pack scanned twice, already sold, or never received is refused |
| Selling | Cash, M-Pesa (typed code, or matched automatically from a till confirmation), credit accounts with limits, price lists, discounts (manager), returns, same-day voids |
| Dispensing | Prescription and controlled items need patient + prescriber; the record is append-only and exportable as CSV |
| Controlled drugs | Receiving, dispensing, adjustments and write-offs need a witness who signs in with their own phone and PIN and is not the actor; running balance per branch; append-only register |
| Money | Day close per cashier (cash counted vs expected), supplier invoices and payments, customer ledgers, reports (net sales, margin, movers, expiry loss, stock value) |
| Your data | CSV exports of sales (line by line), stock by batch, the controlled-drug register, the dispensing log and the trace log |
| Tenancy | Postgres row-level security on every tenant table, forced, app role is not a superuser; the API refuses to start in production if any `org_id` table is unprotected |
| Signup and billing | Phone-code signup, 14-day trial, per-branch monthly plan, invoices, mock M-Pesa payment, suspension to read-only (nothing deleted) |
| Track-and-trace readiness | An **empty** adapter and a log of what a report would contain (see below) |

## What it is NOT (read this)

- **Not connected to the national medicine track-and-trace platforms (NTTS, Practice360, Facility360).** No interface specification, payload or authentication scheme has been published to this project, so none is assumed. `src/ntts/adapter.ts` has one adapter, `NotIntegratedAdapter`, which refuses to send. `ntts_outbox` records what a report would contain, in the same transaction as the stock change, so history can be replayed when a specification exists. The CSV export is Dawa's own format and **is not an official submission**.
- **Not legal classification.** The pharmacy sets each product's class. Dawa does not decide what the law classes a medicine as.
- **No offline mode.** The till needs the network. No receipt printing yet. No stock transfers between branches. No purchase orders or supplier returns. No prescription image capture. No patient record beyond the dispensing log.
- **No real SMS or WhatsApp provider.** Signup codes are logged; an operator relays one with `npm run admin -- messages`.
- **Live M-Pesa is unverified.** The Daraja confirmation endpoint (`POST /v1/mpesa/<secret>/confirmation`) is implemented and tested with synthetic confirmations in Daraja's published C2B shape. Nobody has registered the URL with Safaricom or received a real confirmation. The secret in the path is our own authentication; no Daraja signature scheme is assumed.
- **No backup/restore drill, no per-patient export, no independent security review, no data-protection impact assessment.** Dispensing records are health data; that obligation has not been checked.
- **No load test.** Designed for a pharmacy or a small chain, not for scale.

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
npm run migrate && npx vitest run          # 73 tests: 32 pure logic, 41 integration
node scripts/isolation-check.mjs           # against a running compose stack: 18 live two-tenant checks
```
Run the isolation script after `docker compose up`; it provisions two pharmacies through the operator CLI. Turning RLS off on one table makes 7 of its checks fail and the API refuse to start - that is the control.

## Billing (PROVISIONAL)

`BILLING_PRICE_FIRST_BRANCH_KES=4500`, `BILLING_PRICE_EXTRA_BRANCH_KES=3500` (2-5 branches; 6+ is an agreed per-branch price via `npm run admin -- billing:price`), `BILLING_TRIAL_DAYS=14`, `BILLING_SUSPEND_AFTER_DAYS=14`. Sample branches and archived branches are never billed. `BILLING_MODE=mock` lets an owner simulate paying and is refused in production unless `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`. For a real deployment set `BILLING_MODE=live` with a `BILLING_SHORTCODE`: confirmations on that shortcode are matched to the invoice by account number; unmatched ones are kept for `billing:assign`. Until Safaricom registration is done, record payments by hand: `npm run admin -- billing:pay <org id> <mpesa code> <KES>`.

A suspended account is read-only (writes get HTTP 402) but keeps every record, and M-Pesa confirmations are still recorded against sales. Paying reopens it immediately.

## Layout

Rate limits are per signed-in person (and per phone number for signup and sign-in), never per IP address, because every request from the console reaches the API from the console's one address.

`src/` API (`api/` routes, `sales/`, `inventory/`, `gs1/`, `stocktake/`, `close/`, `payables/`, `customers/`, `reports/`, `ntts/`, `onboarding/`, `billing/`, `signup/`, `mpesa/`), `migrations/` (append-only SQL, 0001-0006), `apps/console/` (Next.js), `scripts/isolation-check.mjs`, `tests/`, `docs/` (`ARCHITECTURE.md`, `FIRST-PHARMACY.md`, `go-to-market/`).
