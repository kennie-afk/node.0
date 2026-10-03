# Architecture notes

One Node/TypeScript API (Express, plain `pg`) and one Next.js console, on Postgres 16. A modular monolith: the rules that matter
(stock and money change together; a controlled drug needs a witness; a day, once closed, is closed) are database transactions, not
network calls.

## Tenancy
Every tenant table has `org_id`, row-level security **enabled and forced**, and one policy `org_id = current_org()`. The API connects
as `dawa_app` (NOSUPERUSER, NOBYPASSRLS, not the owner) and binds the tenant per transaction with `set_config('dawa.org_id', ..., true)`.
Migrations run as a separate owner role and are the only place that role is used. `dawa_protect()` (migration 0001) does all three steps
for a new table. At startup `assertRlsIsEffective()` refuses to run in production if the role could bypass RLS or any table with an
`org_id` column is not forced - so a table a later migration forgets is caught on the next boot. The few lookups that must work before a
tenant is known (sign-in by phone, till number to branch, billing account to organisation) are narrow `SECURITY DEFINER` functions that
return ids and nothing else. `signup_requests` is deliberately exempt (it exists before any tenant) and its pointer to the created
organisation is therefore called `provisioned_org_id`, not `org_id`.

## Stock
`stock_batches.qty_on_hand` has `CHECK (>= 0)` and is the running total of `stock_movements` (append-only; a test asserts they agree after
every scenario). A sale locks the branch's batch rows `FOR UPDATE`, products in a fixed order (no deadlock between two sales), then
allocates first-expiry-first-out in a pure function (`inventory/fefo.ts`) that never touches expired stock. With the lock removed, 15
concurrent sales of one unit against 10 in stock succeed only 6 times instead of exactly 10 - the test fails, which is how it was
verified to be meaningful. Sale numbers (`MAIN-261003-0007`) come from a counter row that is also the lock, so they are gap-free per
branch per day.

## Append-only facts
Stock movements, sale payments, sale returns, customer ledger, dispensing records, controlled register, day closes, supplier invoices and
payments, audit events and the trace log have `UPDATE`/`DELETE`/`TRUNCATE` revoked from the application role. (A side effect worth
knowing: `SELECT ... FOR UPDATE` needs the UPDATE privilege, so supplier-invoice payments are serialised with an advisory lock instead.)

## Controlled drugs
`controlled_balances` is locked per (branch, product) while a register entry is written, so `balance_after` is always true and 14
simultaneous dispensings of a 10-unit holding make exactly 10. Every entry needs `witness_id <> actor_id` (a CHECK, as well as the API
rule): the witness signs in with their own phone and PIN at the till and must hold a role that may handle controlled drugs.

## Money
M-Pesa confirmations are idempotent on the transaction id (a unique partial index), matched to a sale by the typed account reference,
else by exact amount when exactly one pending sale fits in the last 90 minutes, else kept in `mpesa_unmatched` for a manager. A cashier
typing a code claims a payment whichever of the two arrived first. Cash overpayment is change and is not recorded as received.

## What the day close means
Expected cash per person = cash they took on that business day's non-voided sales minus cash refunds they paid out. After a close, no
sale, payment or void can be added to that day for that branch.
