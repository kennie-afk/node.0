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
Charged by an explicit run (`POST /v1/penalties/run`), once per instalment per month. Recognised when charged, held in *Penalties receivable* (1110) until paid.

## Interest income
Recognised **when received** (cash basis), not accrued. An accountant who needs accrual accounting must post journals for it. This is a
deliberate simplification and the main thing an auditor will ask about.

## Ledger
Double entry; every posting is one balanced journal entry (a database constraint refuses an unbalanced one); journal lines are append-only; a mistake is
corrected by a reversal entry, never an edit. Chart: cash 1010, M-Pesa 1020, bank 1030, loans receivable 1100, penalties receivable 1110, member savings
2100 (SACCO only), member deposits 2200 (SACCO only), unapplied receipts 2300, payables 2400, borrowings 2500, capital/share capital 3100, reserves 3200,
accumulated surplus 3300, opening balance equity 3400, interest 4100, penalties 4200, fees 4300, other income 4400, recoveries 4500, bad debts 5100, expenses 5200-5900.
A non-bank lender has no savings/deposits accounts and its equity is "Owner's capital".

## Arrears and portfolio at risk
Days overdue = days since the oldest unpaid instalment's due date. Buckets: current, 1-30, 31-60, 61-90, 91-180, 180+. PAR(n) = outstanding principal of loans
more than n days overdue / total outstanding principal. These are the usual definitions; the classification and provisioning rules a regulator requires may differ and are **not** implemented.

## Write-off
Moves the outstanding principal to *Bad debts written off* (5100); later receipts on a written-off loan are *recoveries* (4500).

## Returns
Templates are data (sections of rows, each a measure from a fixed vocabulary: ledger balance, period movement, surplus, member counts, loans counts, PAR). They are generic
periodic summaries and are stored with `is_official = false` (a database constraint). **Hazina does not know, and does not produce, the real SASRA, Commissioner for
Co-operatives or CBK return formats, and files nothing with anyone.** To match a regulator's format, someone must obtain the real format from the regulator and write a template.

## Statement intake
M-Pesa statement analysis is arithmetic on the uploaded transactions (inflows, outflows, regularity, a configured share of average inflow) plus consistency flags.
The authors have not seen a real Safaricom statement file; the parser finds columns by name and refuses with the headers it found if it cannot. Payslip and ID checks
are arithmetic and format checks (a national ID has no public verification service here). **Flags are for a human to look at. Nothing is a credit decision or a verification.**
