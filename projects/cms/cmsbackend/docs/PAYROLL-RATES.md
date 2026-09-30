# Payroll statutory rates

Retrieved **2026-09-30**. The rate table lives in `src/modules/payroll/rates.ts` and is
versioned by effective date: a payroll month uses the newest set whose `effectiveFrom` is on or
before the first of that month, so past months stay reproducible. **Add a new set when a rate
changes; never edit an old one.** `GET /payroll/rates` publishes the same table, sources included.

Payroll for months before **2025-02-01** is refused, because no rate set is recorded for them.

## What was verified, and how

| Item | Value in the table | Status | Source |
| --- | --- | --- | --- |
| PAYE monthly bands | 10% to 24,000; 25% to 32,333; 30% to 500,000; 32.5% to 800,000; 35% above | **Verified, official** (read from the KRA page) | https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye |
| Personal relief | 2,400 / month | **Verified, official** | same |
| Insurance relief | 15% of premiums, max 60,000 a year (modelled as max 5,000 a month) | **Verified, official** | same |
| Allowable deductions (NSSF, SHIF, housing levy before tax) | pre-tax | Stated on the KRA page (housing levy, SHIF); NSSF as pension contribution | same; also https://serrarigroup.com/kenya-statutory-deductions-2026-nssf-shif-paye-guide/ |
| NSSF | 6% employee + 6% employer; LEL 9,000 and UEL 108,000 from 2026-02-01 (8,000 / 72,000 from 2025-02-01) | **Provisional** - consistent across several professional sources, not read from an NSSF notice or the NSSF Act schedule | https://www.grantthornton.co.ke/insights/tax-alert-1-of-2026/ (states limits rise, figures in a PDF not readable here), https://www.flexi-personnel.com/new-nssf-rates-feb-2026/, https://vialtopartners.com/regional-alerts/kenya-employment-tax-national-social-security-fund-nssf-changes |
| SHIF | 2.75% of gross, minimum 300 | **Provisional** - secondary sources only, not read from an SHA notice | https://serrarigroup.com/kenya-statutory-deductions-2026-nssf-shif-paye-guide/ |
| Affordable Housing Levy | 1.5% employee + 1.5% employer of gross | **Provisional** - KRA page confirms the 1.5% employee rate is deductible; the employer match is from secondary sources | same sources |
| Remittance due date | 9th of the following month | **Provisional** - secondary sources | https://serrarigroup.com/kenya-statutory-deductions-2026-nssf-shif-paye-guide/ |

**Not verified against an official document: NSSF limits, SHIF, levy rates (employer side), and the due
date.** Have an accountant confirm these against the NSSF, SHA and KRA notices before the first real
payroll. The API says so on `GET /payroll/rates` (`note`).

A note on a figure that is easy to misread: sources quote the NSSF "maximum contribution" as
KES 5,940 from February 2026. That is **Tier II only** (6% x (108,000 - 9,000)). The employee's total
maximum is Tier I 540 + Tier II 5,940 = **6,480**, which is what the engine computes.

## Assumptions the engine makes

* NSSF, SHIF and the housing levy are computed on **gross pay** (basic plus all allowances, taxable
  or not).
* **Taxable pay** = basic + taxable allowances - NSSF - SHIF - employee housing levy.
* NSSF is fully deductible (well inside the registered-pension limit of 30,000 a month).
* Every percentage is rounded half-up to the cent once per component; PAYE is summed across bands
  in exact integer arithmetic and rounded once.
* Residents only; no non-resident rate, no pension/mortgage/post-retirement-medical deductions, no
  partial-month proration, no overtime or bonus tax treatment. These are extensions, not hidden
  behaviour.
