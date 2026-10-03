# Hazina

Ledger, M-Pesa reconciliation and periodic returns for small Kenyan SACCOs and non-deposit-taking lenders. Multi-tenant (one organisation, many branches),
self-serve signup, its own subscription billing. Node/TypeScript API (Express, `pg`), Next.js console, Postgres 16.

Working name. Built 2026-10-03 as bet 2 of 3 (research: `~/Software_dev/research/niche-2026-10-03/`, `A-sme-finance.md` candidates 1 and 2, decision in `SYNTHESIS.md`).
**Prices, size tiers, trial length and grace period are PROVISIONAL configuration. Nothing here has had a paying customer.**

## What it does

| Area | Built (tested on real Postgres as the RLS-restricted role) |
|---|---|
| Members | Register, edit, dormant/exited, unique ID number per organisation, CSV import with opening balances (all-or-nothing, posted against opening-balance equity), member statements |
| Savings (SACCO) | Deposits, withdrawals with maker-checker approval above a threshold, balances that always equal the ledger |
| Loans | Products (flat or reducing, fees, insurance, penalty rate, grace days, savings multiple, guarantors); apply -> appraise -> approve -> disburse -> repay -> close; applicant, appraiser and approver must be different people; restructure; write-off; guarantor exposure |
| Repayment | Waterfall penalty -> interest -> principal on the oldest instalment first; idempotent on the M-Pesa code; overpayment kept as unapplied, never lost |
| M-Pesa | Paybill confirmation endpoint (Daraja C2B shape), matched to a member or loan by account reference, unmatched payments kept for a person to assign or ignore, nothing dropped |
| Ledger | Double-entry, balanced by constraint, append-only; manual journals, reversals, chart of accounts, trial balance, income statement, balance sheet |
| Portfolio | Arrears buckets, PAR 1/30/60/90, per-loan positions, penalty run |
| Returns | Template engine (templates are data, no SQL); generic periodic returns, always marked **not official** |
| Intake | M-Pesa statement analysis, payslip arithmetic check, ID format check, capacity figure: flags for a human, never a decision |
| Exports | CSV of members, loans, arrears, M-Pesa payments, journal, trial balance, member and loan statements, returns |
| Tenancy | Postgres RLS enabled and forced on every `org_id` table; app role is not a superuser; the API refuses to start in production if a table is unprotected |
| Signup and billing | Phone-code signup, trial, per-organisation monthly plan by size (below), invoices, mock M-Pesa payment, suspension to read-only (nothing deleted) |
| Roles | owner, manager, loan officer, teller, accountant, auditor; one matrix drives the API and the console |

## What it is NOT (read this)

- **Not a SASRA, CBK or Co-operatives filing tool.** The returns it generates are generic and marked not official. The real formats have not been obtained and none is assumed. See `docs/ACCOUNTING.md`.
- **Not core banking.** No cheque handling, no ATM/card, no standing orders, no inter-SACCO switching. Not for deposit-taking SACCOs under SASRA supervision that need that.
- **Interest is recognised on receipt (cash basis)**, not accrued; there is no IFRS 9 provisioning. An accountant must sign off before anyone treats the statements as audited.
- **Live M-Pesa is unverified.** The confirmation endpoint is tested with synthetic confirmations in Daraja's published shape; nobody has registered the URL with Safaricom or received a real one. No outbound disbursement (B2C) exists: a disbursement is *recorded*, not sent.
- **No SMS provider.** Signup codes are logged; an operator relays one with `npm run admin -- messages`. No repayment reminders to borrowers yet.
- **Statement parsing is untested on real Safaricom files.** See the honesty note in `src/intake/statement.ts`.
- **No offline mode, no mobile app, no member self-service portal, no dividend or interest-on-shares computation, no group/chama lending.**
- **No backup/restore drill, no independent security review, no data-protection impact assessment** (member and loan data is personal data). No load test.

## Run it
```
cp .env.example .env     # replace every placeholder with generated values
docker compose up -d --build
# console http://localhost:3800   api http://localhost:4300
```
Sign up at `/signup`; read the code with `docker compose exec api node dist/admin/cli.js messages`. Tick "sample organisation" on the signup form for a labelled sample SACCO or lender with made-up members and loans (never billed).

## Test it
```
docker run -d --name hazina-pg -e POSTGRES_USER=hazina -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=hazina_test -p 55441:5432 postgres:16-alpine
source scripts/test-env.sh
npm run migrate && npx vitest run
node scripts/isolation-check.mjs     # against a running compose stack: live two-tenant checks (22)
npm i --no-save puppeteer-core && node scripts/console-check.mjs   # headless Chrome through the real console (70); leaves organisations behind, use a throwaway stack
```

## Billing (PROVISIONAL, whole shillings a month)
SACCO up to 500 active members 3,500; up to 3,000 active members 6,000; beyond that 6,000 plus 1,000 per further 1,000 members. Lender up to 2,000 active borrowers 10,000, then 2,000 per further 1,000.
Configured by `BILLING_*` (see `.env.example`). Trial 14 days. `BILLING_MODE=mock` lets an owner simulate paying and is refused in production unless `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`. A suspended
account is read-only (HTTP 402), keeps every record, still records incoming M-Pesa money, and reopens on payment. Until Safaricom registration: `npm run admin -- billing:pay <org id> <mpesa code> <KES>`.

## Layout
`src/` (`api/`, `members/`, `savings/`, `loans/`, `ledger/`, `mpesa/`, `reports/`, `returns/`, `intake/`, `billing/`, `signup/`, `onboarding/`, `admin/`), `migrations/` (append-only SQL, 0001-0005), `apps/console/` (Next.js), `scripts/`, `tests/`, `docs/` (`ARCHITECTURE.md`, `ACCOUNTING.md`, `go-to-market/`).
Rate limits are per signed-in person and per phone number, never per IP address.
