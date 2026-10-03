# Payroll rules Sojaa applies, and what has and has not been verified

Sojaa computes pay. It does not decide what the law requires. Every number below is either **the firm's own setting** or **a placeholder**, and the console says so beside it. Nothing here has been checked by a lawyer, an auditor, KRA, NSSF, SHA or PSRA.

## Verified? A table
| Item | Where it comes from | Status |
|---|---|---|
| Minimum wage KES 30,000 a month, upheld by the High Court (Feb 2025) | Research file D, citing allAfrica and Eastleigh Voice (search results; pages not re-read for this build) | **Reported, not independently verified.** The current Regulation of Wages order may differ and may change. The High Court earlier suspended the regulation before the later ruling (Capital FM, date not checked), so it could reverse |
| A 15% increase announced on Labour Day 2026 | Research file D, citing The Standard | **Reported, not read.** Sojaa does **not** apply it: the minimum is whatever the firm sets |
| Presidential order of 6 Aug 2026 to enforce the wage and NSSF/SHA remittance; "some guards get KES 6,000-7,000" | Research file D, citing The Standard | Reported by that article. The article gives no deadline or penalty; none is assumed |
| Whether fixed allowances count toward the minimum | — | **Unknown.** Sojaa defaults to *no* and makes it a setting |
| Overtime x1.5, rest day x2.0, holiday x2.0 | Placeholders chosen by this project | **Unverified.** The firm sets its own. Premium convention: rest-day and holiday work is paid *in addition to* basic (hours x hourly rate x multiplier); overtime is approved minutes x hourly rate x multiplier. A firm whose contracts say otherwise sets the multiplier to match |
| 225 standard hours in a month (hourly rate = monthly basic / 225) | Placeholder | **Unverified** |
| Weekly hour cap, rest between shifts | — | **Switched off by default. Sojaa states no legal limit.** Whatever the firm sets is enforced when rostering |
| NSSF 6% + 6% up to an upper limit of KES 72,000 | Illustrative starter set from general knowledge | **Unverified. Not checked against NSSF.** Loads unconfirmed |
| SHA 2.75% with a KES 300 minimum | Illustrative starter set | **Unverified. Not checked against SHA.** Loads unconfirmed |
| Housing levy 1.5% + 1.5% | Illustrative starter set | **Unverified.** Loads unconfirmed |
| PAYE bands (10%, 25%, 30%, 32.5%, 35%), personal relief KES 2,400 a month, NSSF and housing levy deducted before tax | Illustrative starter set | **Unverified. Not checked against KRA.** Loads unconfirmed. Insurance relief and other reliefs are not modelled |
| Public holidays | — | **No calendar is shipped**: dates move and a wrong built-in date would mis-pay guards. The firm enters them |
| PSRA registration, PSRA expiry, NSSF, SHA, KRA numbers | Typed by the firm | **Never verified.** No public verification service exists to call. A "PSRA expired" flag means only that the date the firm typed has passed |
| PSRA, NSSF, SHA, KRA reporting or remittance formats | — | **None found, none assumed.** Sojaa produces CSVs of the firm's own records and files nothing |

## How the figures are computed (`src/payroll/compute.ts`)
- **Month:** one calendar month in Nairobi time. Days employed = days from the later of the hire date and the first, to the earlier of the exit date and the last, inclusive.
- **Basic and allowances:** monthly figure x days employed / days in the month, rounded to the cent.
- **Hourly rate:** monthly basic / standard monthly hours (225 by default).
- **Worked minutes** (only from shifts with a check-in **and** a check-out): minutes between them, capped at scheduled minutes plus overtime approved by an operations manager or the owner.
- **Overtime:** approved minutes, and never more than were actually worked beyond the scheduled shift, x hourly rate x overtime multiplier.
- **Holiday and rest-day premium:** regular minutes worked on a holiday the firm entered, or on the guard's weekly rest day, x hourly rate x that day's multiplier. A holiday on a rest day pays once, as a holiday.
- **Adjustments:** the sum of append-only adjustments whose effective month is this month.
- **Gross** = basic + allowances + premium + overtime + adjustments.
- **Deductions:** each *confirmed* table applied to gross (NSSF to gross up to its limit; SHA clamped to its minimum and optional maximum; housing levy to gross; PAYE progressive on gross less the deductions the table lists, less relief, never below zero). An unconfirmed or not-applicable table deducts nothing and the payslip says so. **Net** = gross - employee deductions. **Employer cost** = gross + employer contributions.
- **Minimum-wage test:** prorated basic (plus allowances only if the firm says they count) against the minimum prorated by days employed. **Overtime, premiums and adjustments never count toward the minimum.** A guard below it carries a *blocking* flag.

## Flags
`below_minimum` and `negative_net` block closing unless the owner or payroll writes an acknowledgement (at least ten characters), which is kept in the audit trail and the period's snapshot. Warnings (do not block): missing national ID, NSSF, SHA, KRA PIN, PSRA registration (an NSSF, SHA or KRA warning is skipped when the firm marked that table not applicable), and a PSRA expiry date that has passed. Shifts with a check-in and no check-out are counted as *unresolved* and also need the acknowledgement.

## What closing means
Closing re-computes the month, requires all four tables confirmed or marked not applicable, stores a snapshot, and from then on database triggers refuse any change to the period or its payslips. A mistake found later is corrected by an adjustment in an open month, with the closed month named as the one it corrects. There is no "reopen".

## What a firm must still do itself
Check the minimum against the current order and its contracts. Check every deduction table against the official schedules and confirm it with a note saying what was checked. Enter public holidays. Decide whether allowances count. Set overtime and premium multipliers to what its contracts say. Remit NSSF, SHA, housing levy and PAYE, and file whatever returns the law requires, outside Sojaa. Have an accountant look at the figures before relying on them.
