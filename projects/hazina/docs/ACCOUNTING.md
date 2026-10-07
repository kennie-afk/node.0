# Accounting rules Hazina applies

These are the rules the software follows. They are standard, but they are *Hazina's* rules: an organisation's own loan policy and its
accountant must agree with them before the figures are relied on, and nothing here has been reviewed by an auditor.

## Money
Whole cents everywhere (`bigint` in the database, integers in code; multiplications that can pass 2^53 use BigInt). A rate is basis
points a year (1200 = 12.00%).

## Schedules (`src/loans/schedule.ts`)
- **Flat:** total interest = principal x rate x months / 12, spread evenly; principal spread evenly; remainder cents go to the last instalment.
- **Reducing balance:** equal instalments P x i / (1 - (1+i)^-n), i = rate/12, rounded to the cent; each month's interest is opening balance x i; the last instalment clears the exact remaining balance.
- Due dates fall on the same day of each month, clamped to month end.

## Repayment allocation
Oldest instalment first; inside one instalment: penalty, then interest, then principal. A payment larger than what is due clears later
instalments in order. What remains after the last instalment is recorded as *unapplied* (a liability, account 2300), never discarded.
A repayment reference is idempotent: the same M-Pesa code twice posts once.

## Penalties
One month's penalty on an overdue instalment = (overdue principal + interest) x the product's monthly penalty rate, after the product's grace days.
Charged by a run, once per instalment per month: nightly by the scheduler (see "Daily jobs") or by hand (`POST /v1/penalties/run`). Recognised when charged, held in
*Penalties receivable* (1110) until paid. The run works in transactions of about 500 loans, one journal entry per loan, and skips (and reports) a loan a repayment holds at that moment instead of waiting for it.

## Interest income (accrual per instalment)
Interest on an instalment is **accrued when the instalment falls due**: Dr *Accrued interest receivable* (1120), Cr *Interest on loans* (4100), one entry per instalment dated its
due day (`POST /v1/interest-accrual/run`, and nightly). Interest **paid before its due date** is recognised on receipt (Cr 4100 at once); accrual then books only what is still unpaid.
A repayment of accrued interest clears the receivable (Cr 1120), never income twice. Writing a loan off, or restructuring it, takes its accrued-and-unpaid interest off the
receivable against interest income (Dr 4100, Cr 1120): interest that will not be collected stops being income. There is no non-accrual (interest suspension) rule: interest keeps
accruing on an overdue loan until it is written off or restructured. Whether that matches the organisation's policy is for its accountant; the provision below is the counterweight.
This replaces the earlier cash-basis treatment; instalments accrued by the first run after upgrading are dated their (past) due days, or the first open day if that period is closed.

## Loan loss provision (ILLUSTRATIVE, not regulatory guidance)
`POST /v1/provisioning/run` (and the Month end screen). Exposure of a loan = unpaid principal + accrued, unpaid interest. A loan's bucket is its oldest unpaid overdue instalment's age
(current, 1-30, 31-60, 61-90, 91-180, 180+). Required provision = sum over buckets of exposure x a percentage held in the organisation's settings (`provision_rates_bp`). The
shipped defaults (1%, 5%, 25%, 50%, 75%, 100%) are **placeholders, not the CBK prudential guidelines, not SASRA's rules and not an IFRS 9 expected-credit-loss model**: an
accountant sets the real ones. The run compares the requirement with the credit balance of *Loan loss provision* (1190, a contra-asset) and posts only the difference
(Dr/Cr *Provision expense* 5150), so a second run the same day posts nothing and a repaid loan releases its slice. Ageing is as at today only (schedules keep no history).

## M-Pesa money and suspense
A paybill payment is booked **on arrival**: Dr *M-Pesa collections* (1020), Cr *M-Pesa suspense* (2310). Applying it (automatically, or when a person assigns it) debits the suspense instead of
1020 for the deposit or repayment, so 2310 holds exactly the money received and not yet applied (unmatched, or set aside). The reconciliation screen (`GET /v1/mpesa/reconciliation`)
shows received, applied and unapplied by Nairobi day and checks the ledger's 2310 against the payments it should hold. Payments received before this existed have no receipt entry and
are applied the old way. A statement file can be compared with the recorded payments by transaction code (nothing is posted); that parser is unverified against a real Safaricom file.

## Closing periods and snapshots
Closing the books through a date (`POST /v1/periods/close`) makes the ledger refuse any entry dated on or before it. Money that has arrived, accruals and penalties for a closed day are dated
the first open day instead of failing. Reopening is an owner's action, needs a reason, and is audited. Closing also stores cumulative balance snapshots (at the closing day and at each month end passed);
trial balance and balance sheet read the latest snapshot plus the lines after it, which gives the same figures as summing every line (tested). A snapshot cannot go stale because nothing can be posted into a closed period.

## Savings interest and share dividends
One run per kind per period end (`POST /v1/dividends/run`, SACCO only). The rate is an annual rate applied to each member's balance **at the period end** (not an average over the year).
Savings interest: Dr *Interest on member savings* (5500), Cr member savings. Share dividend: Dr *Accumulated surplus* (3300), Cr member savings. One entry per member; a repeat for the
same period posts nothing. Which rate to declare, and whether members must vote on it, are the SACCO's decisions; no statutory rate is assumed.

## Guarantors
A guarantee binds while its loan is being repaid and is released (`released_on`) when the loan is repaid in full; a restructured loan's guarantors carry over to the new loan. On default (loan overdue or
written off) a manager can **call** a guarantee (`POST /v1/loans/:id/guarantee-calls`): the guarantor's savings are applied to the loan through the normal repayment waterfall (or as a recovery on a
written-off loan), capped by what the guarantor undertook and what their savings can cover, and appear on the guarantor's savings statement.

## Daily jobs
Once a day after `DAILY_JOBS_HOUR` (Nairobi time, default 01:00) each organisation gets interest accrual, then penalties, then reminders if `SMS_REMINDERS_AUTO=true`. Each organisation's run takes
`pg_try_advisory_lock`, so several API replicas never run it twice at once; every job is idempotent anyway.

## Journal numbering
Entry numbers per organisation are **gap-free** (one counter row, locked until the transaction ends); that is a stated property (an auditor can say "entries 1 to N, none missing") and it is kept, for system
postings as well as manual ones. Relaxing it for system postings with a sequence would put two numbering schemes in one journal. What was fixed instead is how long the lock is held: batch jobs post
through `postEntries`, which takes the counter once, for the whole batch, at the end, so it is held for milliseconds rather than for the length of a job. The cost that remains is that postings in one
organisation commit one at a time at the numbering step; measure before changing it.

## Ledger
Double entry; every posting is one balanced journal entry (a database constraint refuses an unbalanced one); journal lines are append-only; a mistake is
corrected by a reversal entry, never an edit. Chart: cash 1010, M-Pesa 1020, bank 1030, loans receivable 1100, penalties receivable 1110, accrued interest receivable 1120, loan loss provision 1190 (contra-asset), member savings
2100 (SACCO only), member deposits 2200 (SACCO only), unapplied receipts 2300, M-Pesa suspense 2310, payables 2400, borrowings 2500, capital/share capital 3100, reserves 3200,
accumulated surplus 3300, opening balance equity 3400, interest 4100, penalties 4200, fees 4300, other income 4400, recoveries 4500, bad debts 5100, provision expense 5150, expenses 5200-5900 (interest on member savings 5500, SACCO only). Accounts added after an organisation existed (1120, 1190, 2310, 5150, 5500) are created on first use.
A non-bank lender has no savings/deposits accounts and its equity is "Owner's capital".

## Arrears and portfolio at risk
Days overdue = days since the oldest unpaid instalment's due date. Buckets: current, 1-30, 31-60, 61-90, 91-180, 180+. PAR(n) = outstanding principal of loans
more than n days overdue / total outstanding principal, aggregated in the database. These are the usual definitions; the classification and provisioning rules a regulator requires may differ and are **not** implemented (the provision above is a configurable illustration).

## Write-off
Moves the outstanding principal and unpaid penalties to *Bad debts written off* (5100) and reverses accrued, unpaid interest against interest income; later receipts on a written-off loan are *recoveries* (4500).

## Returns
Templates are data (sections of rows, each a measure from a fixed vocabulary: ledger balance, period movement, surplus, member counts, loans counts, PAR). They are generic
periodic summaries and are stored with `is_official = false` (a database constraint). **Hazina does not know, and does not produce, the real SASRA, Commissioner for
Co-operatives or CBK return formats, and files nothing with anyone.** To match a regulator's format, someone must obtain the real format from the regulator and write a template.

## Statement intake
M-Pesa statement analysis is arithmetic on the uploaded transactions (inflows, outflows, regularity, a configured share of average inflow) plus consistency flags.
The authors have not seen a real Safaricom statement file; the parser finds columns by name and refuses with the headers it found if it cannot. Payslip and ID checks
are arithmetic and format checks (a national ID has no public verification service here). **Flags are for a human to look at. Nothing is a credit decision or a verification.**
