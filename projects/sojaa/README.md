# Sojaa

Guard attendance, patrols, rosters, payroll checked against the minimum wage, and client invoices built from verified shifts, for Kenyan private security firms. Multi-tenant (one firm, many branches), self-serve signup, its own subscription billing. Node/TypeScript API (Express, `pg`), Next.js console, Postgres 16.

Working name. Built 2026-10-03 as bet 3 of 3 (research: `~/Software_dev/research/niche-2026-10-03/D-transport-informal.md` candidate 1, decision in `SYNTHESIS.md`).
**Prices, the minimum wage, every multiplier and every deduction rate are PROVISIONAL or the firm's own configuration. Nothing here has had a paying customer.**

## What it does

| Area | Built (tested on real Postgres as the RLS-restricted role) |
|---|---|
| Guards | Number, ID, phone, PSRA registration and expiry, NSSF, SHA, KRA PIN **as the firm types them** (nothing is verified), rest day, hire and exit dates; paged and searched on the server; wages visible only to owner, payroll and auditor, every pay change audited |
| Clients, sites, posts | Clients with payment terms; sites with a map position and an allowed distance; posts; a private read-only attendance link per client |
| Attendance | Check-in and check-out stamped by the **server clock** (a time sent by a phone is ignored); a phone's position is compared with the site (`within` / `outside` / `unknown`, never blocking); one check-in and one check-out per shift enforced by the database; late, missed and no-check-out detection; supervisor correction as a new event with a reason, the original kept; a guard can check in alone with phone + PIN (throttled in Postgres: the guesser's address+phone locks first, with a doubling back-off, and a guard on another address is not locked out); the board counts, orders and pages in SQL |
| Patrols | Secret QR tokens per checkpoint (rotating one kills the old), ordered or unordered rounds, shortfall per shift, printable QR plates |
| Rosters | Shift patterns (night shifts cross midnight), runs of shifts, week grid, publish, swaps that someone else approves, approved overtime; **no double-booking, enforced by an exclusion constraint** plus a per-guard lock; weekly-hour and rest limits only if the firm sets them |
| Payroll | Calendar-month periods; basic and allowances prorated by days employed; holiday and rest-day premiums and overtime from verified attendance (a shift that crosses midnight is split by Nairobi calendar day, so a night shift into a holiday or rest day earns the premium for those minutes); four deduction tables (NSSF, SHA, housing levy, PAYE) that the firm enters and **a named person confirms**; compliance report listing guards below the configured minimum; payslips (printable HTML) and register CSV; closing is permanent (database triggers); corrections are append-only adjustments paid in an open month |
| Invoicing | Rates per site or post, per shift or per hour, effective-dated; invoices from shifts with a check-in **and** a check-out, each shift billed once (unique key); evidence per invoice; credit notes; disputes; payments allocated oldest first with the excess held on account; debtors ageing; margin per client |
| Leave and absence | Annual, sick and unpaid leave: request, approve or refuse with a reason, cancel, balances against the firm's own entitlement (21 annual days is a PLACEHOLDER); no overlaps (database constraint). The **absence deduction is the employer's choice and OFF by default**: `unpaid_leave` deducts approved unpaid-leave days, `unpaid_leave_and_missed` also deducts a day for each calendar day with a missed shift not covered by approved leave. Calendar-day proration of basic and allowances; the minimum-wage test is unchanged. When it is off, payslips carry a warning saying what was not deducted |
| Expiries and alerts | One list of PSRA expiry (as typed), training certificates and equipment return dates, lapsed or due within N days, paged in SQL; alerts queued once per item and date in a per-firm outbox, sent by a dispatcher with retries and back-off through the configured provider (mock by default, Africa's Talking available: see below) |
| Incidents | Append-only reports with severity, notes, close and reopen |
| Tenancy | Postgres RLS enabled and forced on every `org_id` table; app role is not a superuser; the API refuses to start in production if any such table is unprotected |
| Signup and billing | Phone-code signup, 14-day trial, KES 200 per active guard per month (minimum 3,000), invoices, mock M-Pesa payment, suspension to read-only (nothing deleted) |
| Roles | owner, operations manager, supervisor (one branch, no wages), payroll, auditor; one matrix drives the API and the console |
| Exports | CSV of guards, attendance, payroll register, compliance, debtors, invoice evidence, incidents; printable payslips |

## What it is NOT (read this)

- **Not a verifier.** PSRA registration, NSSF, SHA and KRA numbers are kept as typed. There is no public verification service and none is assumed.
- **Not connected to PSRA, the Ministry of Labour, NSSF, SHA or KRA.** It files, remits and reports nothing. No reporting format from any of them has been found or assumed. Remitting deductions and filing returns remain the firm's job.
- **Not legal advice.** The KES 30,000 minimum is the figure from the 2025 High Court ruling reported in the research; the current order must be checked by the firm. The overtime, rest-day and holiday multipliers and the monthly-hours divisor are **placeholders**. The illustrative deduction set is **unverified**. Roster limits start switched off because no legal limit is asserted. See `docs/PAYROLL-RULES.md`.
- **Does not pay anyone.** It computes pay; it moves no money for the firm and holds none. No M-Pesa B2C.
- **Cannot make a false record true.** A supervisor can tap check-in for a guard who is not there. The geofence and QR patrols make that harder to do quietly and easier to see; they do not prevent it. No selfie or biometric check exists.
- **No offline mode** and no native app: check-in needs the network and a browser. A phone with no signal means a supervisor correction afterwards.
- **SMS is mock unless configured.** With `NOTIFY_PROVIDER=mock` (default) signup codes and alerts are only logged; an operator relays a code with `npm run admin -- messages`. `NOTIFY_PROVIDER=africastalking` (`AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID`, `AT_BASE_URL`) uses a fetch-based client written from the provider's public description and **tested only against a stub HTTP server, never the real service: unverified**. No roster or payslip messages to guards; only expiry alerts use the outbox.
- **Live M-Pesa for Sojaa's own subscription is unverified.** The confirmation endpoint is tested with synthetic confirmations in Daraja's published shape; nobody has registered the URL with Safaricom or received a real one.
- **No client-facing invoice PDF or email**, no tax invoicing (no KRA eTIMS integration), no dividends of any kind, no statutory-return generation. Training and equipment records have an API but no console form yet (the Expiries screen lists them).
- **Backups are scripts, not a service.** `scripts/backup.sh`, `restore.sh` and `backup-drill.sh` exist and the drill passed against a scratch Postgres 16; nobody schedules them or copies the dumps off the machine for you. No independent security review, no data-protection impact assessment (guards' ID numbers and locations are personal data). No load test (the billing cycle, the exports and the dashboard have scale tests with bulk-seeded rows, not a full load test). The dashboard's payroll figure still computes the full month in JavaScript (cached for `DASHBOARD_CACHE_SECONDS`, default 45, cleared by any write from the same firm in that process); only counts and debtors are SQL aggregates.
- Kenya only: one time zone (Africa/Nairobi), KES, Kenyan phone numbers.

## Run it
```
cp .env.example .env     # replace every placeholder with generated values
docker compose up -d --build
# console http://localhost:3900   api http://localhost:4400
```
Sign up at `/signup` (tick the sample box to look around first); read the code with `docker compose exec api node dist/admin/cli.js messages`. Guards check in at `/guard`; supervisors use `/console/check` on a phone.

## Test it
```
docker run -d --name sojaa-pg -e POSTGRES_USER=sojaa -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=sojaa_test -p 55442:5432 postgres:16-alpine
source scripts/test-env.sh
npm run migrate && npx vitest run            # 193 tests (2026-10-06); integration tests need SOJAA_INTEGRATION=1
node scripts/isolation-check.mjs             # against a running stack: 22 live two-firm checks
npm i --no-save puppeteer-core && node scripts/console-check.mjs   # 91 headless-Chrome checks; leaves firms behind, use a throwaway stack
```
Controls verified by failure (the matching tests fail when the control is removed): row-level security on one table, the one-check-in-per-shift index, the closed-period triggers, the bill-once unique key.

## Billing (PROVISIONAL, whole shillings a month)
`BILLING_PRICE_PER_GUARD_KES=200`, `BILLING_MINIMUM_KES=3000`, `BILLING_TRIAL_DAYS=14`, `BILLING_SUSPEND_AFTER_DAYS=14`. Billed on active guards on the day the invoice is issued; guards who left, and sample firms, are never billed. The research priced this at KES 150-250 a guard, **an estimate: no Kenyan guard-software price exists to check it against**. `BILLING_MODE=mock` lets an owner simulate paying and is refused in production unless `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`. A suspended account is read-only (HTTP 402), keeps every record, and reopens on payment. Until Safaricom registration: `npm run admin -- billing:pay <org id> <mpesa code> <KES>`.

## Layout
`src/` (`api/`, `ops/` guards, sites, roster, attendance, patrol, incidents, `payroll/`, `invoicing/`, `billing/`, `signup/`, `onboarding/`, `admin/`), `migrations/` (append-only SQL, 0001-0011; the runner takes an advisory lock, records a SHA-256 per file and refuses to start if an applied file was edited), `deploy/` (Caddyfile), `apps/console/` (Next.js), `scripts/`, `tests/`, `docs/` (`ARCHITECTURE.md`, `PAYROLL-RULES.md`, `screenshots/`, `go-to-market/`).
Rate limits are per signed-in person and per phone number, never per IP address (every console request arrives from the console's one address).

## Deploying for real
`docker-compose.yml` is the local / demo path (mock billing allowed, ports published). For a server:
```
cp .env.example .env     # set SOJAA_DOMAIN, BILLING_SHORTCODE, real secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
The override (Compose 2.24+) forces `BILLING_MODE=live`, removes every published port except Caddy's 80/443, adds restart policies and log rotation. **Caddy terminates TLS** (`deploy/Caddyfile`): it obtains a certificate for `SOJAA_DOMAIN` automatically, which needs a DNS record pointing at the server and ports 80/443 open. The M-Pesa callback URL to register is `https://<SOJAA_DOMAIN>/v1/mpesa/c2b/<MPESA_CALLBACK_SECRET>/confirmation`. The override was syntax-checked with `docker compose config`; **it has not been run on a real server**.

Backups: `scripts/backup.sh` (custom-format dump + SHA-256, keeps the newest 14), `scripts/restore.sh <dump> <new database>` (never overwrites), `scripts/backup-drill.sh` (backup, restore into a scratch database, compare row counts of key tables). Copy the dumps off the machine.

## Operations notes
- The hourly billing cycle visits only firms with something to do (an invoice window open, or a stored status that is stale), a page at a time, under a Postgres advisory lock so one replica runs it. Account numbers are `AS` + 8 digits + a Luhn check digit; a number with a wrong check digit is held in the unmatched list, never credited to another firm. Older six-digit numbers still work (they have no check digit).
- CSV exports stream through a database cursor with no row cap.
- Sign-in / PIN throttling: `LOGIN_RATE_LIMIT_PER_WINDOW` per address+phone, then a doubling lock (1 minute up to 1 hour); a separate account-level ceiling (20x that, 5 minute lock, never escalating) stops a guess spread over many addresses. Behind a proxy that does not pass the client address the two keys collapse into one.
- `MPESA_SIMULATOR` was dead configuration and has been removed (the console's mock payment is `BILLING_MODE=mock`).
