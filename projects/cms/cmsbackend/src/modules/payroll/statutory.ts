/**
 * The statutory engine: pure functions, integer minor units, no I/O. Order of operations follows
 * the rate set:
 *   gross           = basic + every allowance
 *   NSSF, SHIF, AHL = computed on gross (NSSF in two tiers)
 *   taxable pay     = basic + taxable allowances - pre-tax statutory deductions
 *   PAYE            = banded tax on taxable pay - personal relief - insurance relief, never below 0
 *   net             = gross - NSSF - SHIF - AHL - PAYE - other deductions - advance recovery
 * Every percentage is rounded half-up to the cent once, at the component, never cumulatively.
 */
import { percentOf, roundHalfUp } from '../../common/money';
import type { PayeBand, RateSet } from './rates';

export interface Allowance {
  name: string;
  amountMinor: number;
  taxable: boolean;
}

export interface Deduction {
  name: string;
  amountMinor: number;
}

export interface PayInput {
  basicMinor: number;
  allowances: Allowance[];
  deductions: Deduction[];
  /** Monthly insurance premiums paid by the employee, for insurance relief. */
  insurancePremiumMinor?: number;
  advanceRecoveryMinor?: number;
}

export interface PayResult {
  basicMinor: number;
  taxableAllowancesMinor: number;
  nonTaxableAllowancesMinor: number;
  grossMinor: number;
  nssfTier1Minor: number;
  nssfTier2Minor: number;
  nssfEmployeeMinor: number;
  nssfEmployerMinor: number;
  shifMinor: number;
  housingLevyEmployeeMinor: number;
  housingLevyEmployerMinor: number;
  taxablePayMinor: number;
  payeBeforeReliefMinor: number;
  personalReliefMinor: number;
  insuranceReliefMinor: number;
  payeMinor: number;
  otherDeductionsMinor: number;
  advanceRecoveryMinor: number;
  totalDeductionsMinor: number;
  netMinor: number;
  employerCostMinor: number;
}

export function nssf(grossMinor: number, set: RateSet) {
  const { rateBps, lowerLimitMinor, upperLimitMinor } = set.nssf;
  const tier1 = percentOf(Math.min(grossMinor, lowerLimitMinor), rateBps);
  const tier2 = percentOf(Math.max(0, Math.min(grossMinor, upperLimitMinor) - lowerLimitMinor), rateBps);
  return { tier1, tier2, total: tier1 + tier2 };
}

export function shif(grossMinor: number, set: RateSet): number {
  return Math.max(set.shif.minimumMinor, percentOf(grossMinor, set.shif.rateBps));
}

/**
 * Banded tax. Each band's slice is multiplied by its rate in exact integer arithmetic (BigInt, so
 * a very large salary cannot overflow) and the total is rounded once.
 */
export function payeBeforeRelief(taxableMinor: number, bands: PayeBand[]): number {
  if (taxableMinor <= 0) return 0;
  let floor = 0;
  let numerator = 0n;
  for (const band of bands) {
    if (taxableMinor <= floor) break;
    const ceiling = band.upTo === null ? taxableMinor : Math.min(taxableMinor, band.upTo);
    numerator += BigInt(ceiling - floor) * BigInt(band.bps);
    if (band.upTo === null || taxableMinor <= band.upTo) break;
    floor = band.upTo;
  }
  return roundHalfUp(Number(numerator) / 10_000);
}

export function insuranceRelief(premiumMinor: number, set: RateSet): number {
  return Math.min(set.insuranceReliefMaxMinor, percentOf(Math.max(0, premiumMinor), set.insuranceReliefBps));
}

export function calculatePay(input: PayInput, set: RateSet): PayResult {
  const taxableAllowances = input.allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amountMinor, 0);
  const nonTaxableAllowances = input.allowances.filter((a) => !a.taxable).reduce((s, a) => s + a.amountMinor, 0);
  const gross = input.basicMinor + taxableAllowances + nonTaxableAllowances;

  const pension = nssf(gross, set);
  const shifAmount = shif(gross, set);
  const housingEmployee = percentOf(gross, set.housingLevy.employeeBps);
  const housingEmployer = percentOf(gross, set.housingLevy.employerBps);

  const preTax =
    (set.preTax.nssf ? pension.total : 0) + (set.preTax.shif ? shifAmount : 0) + (set.preTax.housingLevy ? housingEmployee : 0);
  const taxablePay = Math.max(0, input.basicMinor + taxableAllowances - preTax);

  const before = payeBeforeRelief(taxablePay, set.payeBands);
  const insurance = insuranceRelief(input.insurancePremiumMinor ?? 0, set);
  const paye = Math.max(0, before - set.personalReliefMinor - insurance);

  const other = input.deductions.reduce((s, d) => s + d.amountMinor, 0);
  const advance = input.advanceRecoveryMinor ?? 0;
  const totalDeductions = pension.total + shifAmount + housingEmployee + paye + other + advance;

  return {
    basicMinor: input.basicMinor,
    taxableAllowancesMinor: taxableAllowances,
    nonTaxableAllowancesMinor: nonTaxableAllowances,
    grossMinor: gross,
    nssfTier1Minor: pension.tier1,
    nssfTier2Minor: pension.tier2,
    nssfEmployeeMinor: pension.total,
    nssfEmployerMinor: pension.total,
    shifMinor: shifAmount,
    housingLevyEmployeeMinor: housingEmployee,
    housingLevyEmployerMinor: housingEmployer,
    taxablePayMinor: taxablePay,
    payeBeforeReliefMinor: before,
    personalReliefMinor: Math.min(before, set.personalReliefMinor),
    insuranceReliefMinor: insurance,
    payeMinor: paye,
    otherDeductionsMinor: other,
    advanceRecoveryMinor: advance,
    totalDeductionsMinor: totalDeductions,
    netMinor: gross - totalDeductions,
    employerCostMinor: gross + pension.total + housingEmployer
  };
}
