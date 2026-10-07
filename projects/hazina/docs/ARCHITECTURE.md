# Architecture notes

One Node/TypeScript API (Express, plain `pg`) and one Next.js console, on Postgres 16. A modular monolith: the rules that matter
(a journal entry balances; a loan's steps are done by different people; a payment is applied once) are database transactions and
constraints, not network calls.

## Tenancy
Every tenant table has `org_id`, row-level security **enabled and forced**, and one policy `org_id = current_org()`. The API connects
as `hazina_app` (NOSUPERUSER, NOBYPASSRLS, not the owner) and binds the tenant per transaction with `set_config('hazina.org_id', ..., true)`.
Migrations run as a separate owner role and are the only place that role is used. `hazina_protect()` (migration 0001) does all three steps
for a new table. At startup `assertRlsIsEffective()` refuses to run in production if the role could bypass RLS or any table with an
`org_id` column is not forced, so a table a later migration forgets is caught on the next boot. The few lookups that must work before a
tenant is known (sign-in by phone, paybill to branch, billing account to organisation) are narrow `SECURITY DEFINER` functions that
return ids and nothing else. `signup_requests` is deliberately exempt (it exists before any tenant). `scripts/isolation-check.mjs` proves
the above against a running stack: one SACCO cannot read, change or write into another's members, loans or ledger, through the API or in SQL.

A paybill number is globally unique (an M-Pesa confirmation arrives with a paybill and no tenant). Nothing verifies that the person
entering a paybill owns it; see "What is not verified" in the README.

## The ledger
Journal entries and their lines are append-only (`UPDATE`/`DELETE`/`TRUNCATE` are revoked from the application role) and an entry cannot be
unbalanced (a deferred trigger checks it at commit; see migration 0003). Every deposit, withdrawal, loan payout, repayment, penalty, write-off
and M-Pesa receipt posts through one function (`ledger/service.ts: postEntry`). The trial balance, income statement and balance sheet are
sums over those lines and nothing else; the console shows "debits equal credits" and "assets equal liabilities plus equity" and says so
loudly if either ever fails. A manual entry can be reversed; an entry made by a product feature cannot (it is tied to a schedule or a member
balance, so it is corrected through that feature). Interest is accrued per instalment when it falls due (paid early, on receipt) and penalties when charged; received M-Pesa money is held in a suspense liability until applied; closed periods refuse postings: `docs/ACCOUNTING.md`.

## Members and M-Pesa references
A member number (`M00001`) and a loan number (`L00001`) come from gap-free counters and are the account number a person quotes when paying
the paybill. `parseReference` reads them in any case, with or without spaces or dashes (`M00001SH` is shares, `M00001DP` deposits). A
confirmation is idempotent on the M-Pesa transaction id (a unique index), so a repeated callback cannot double a payment. A payment that
names nobody is kept in `mpesa_payments` as `unmatched` for a person to assign or set aside with a note; it is never dropped and never guessed.
The confirmation URL carries `MPESA_CALLBACK_SECRET` as a path segment: that is our own authentication of the caller, not a Daraja signature.

## Loans
Interest schedules (`loans/schedule.ts`) are pure functions on integers (flat or reducing balance, round-half-up) so every figure is testable
without a database. A loan copies its product's terms when applied for. Apply, appraise, approve and pay out are separate steps, and the
service refuses the same person at consecutive steps (`mayCheck`), unless the owner has relaxed that in settings, in which case the audit
trail records the exception. The schedule is created at payout. A repayment clears penalty, then interest, then principal, oldest
instalment first; the unapplied remainder is held, not lost. Arrears and portfolio at risk are read from schedules, which keep no history,
so they are only ever "as at today" and the API takes no date for them. Penalties are unique per (loan, instalment, month), so running them
twice adds nothing. A restructure moves unpaid principal to a new loan and waives overdue interest and penalties (a provisional policy,
audited).

## Returns
`returns/engine.ts` evaluates a template (sections of rows, each a measure such as a ledger balance for a period, a member count or a PAR
figure) against the ledger and loan book. Every generated return carries a banner that it is **not** a regulator return. Adding a regulator's
format later is a new template, not new code; earlier versions stay for the returns already made with them.

## Intake
Statement analysis (`intake/`) parses an uploaded M-Pesa statement by header *name*, summarises inflow and regularity, and compares an
instalment with a configured share of average inflow. The payslip and ID checks are arithmetic and format rules. All of it produces flags for
a person to read, never a decision. The authors have not seen a real Safaricom statement file; the parser refuses with the headers it found
rather than guess.

## Billing
Hazina's own subscription: a trial from the day an organisation exists, then a monthly invoice by size (active members for a SACCO, active
borrowers for a lender), paid by M-Pesa to Hazina's paybill through the same confirmation path, suspension to read-only (nothing deleted).
Prices are configuration (`BILLING_*`) and provisional.

## Console
Next.js server components call the API with the session token held in an httpOnly cookie, so the browser never has it. CSV downloads go
through `/console/download/<kind>`, which adds the token. The console carries a copy of the permission table (`lib/roles.ts`) only to decide
what to show; the API is the authority and refuses what the copy lets through. A confirmation raised by a server action is shown in a banner
that outlives the form (a loan moving to its next step removes the form that caused it).
