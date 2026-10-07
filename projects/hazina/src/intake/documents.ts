/**
 * Document consistency checks. Each is arithmetic or a format rule, and each result is a flag for a person to look at,
 * never a verdict. Statutory deductions (PAYE, NSSF, the health levy, the housing levy) are NOT recomputed: their rates
 * change and Hazina does not pretend to know the current ones. What can be checked from the page alone is whether the
 * page agrees with itself.
 */
import { Flag } from './statement';
import { moneyText } from '../domain/money';

export interface PayslipInput {
  grossCents: number;
  deductions: Array<{ name: string; amountCents: number }>;
  netCents: number;
  month?: string | null;
}

/** A payslip should add up: gross less every listed deduction is net. A tolerance of one shilling covers rounding. */
export function checkPayslip(input: PayslipInput): Flag[] {
  const flags: Flag[] = [];
  const totalDeductions = input.deductions.reduce((s, d) => s + d.amountCents, 0);
  const expectedNet = input.grossCents - totalDeductions;
  if (input.netCents > input.grossCents) flags.push({ code: 'net_above_gross', severity: 'high', message: 'Net pay is higher than gross pay.' });
  if (Math.abs(expectedNet - input.netCents) > 100) {
    flags.push({
      code: 'arithmetic',
      severity: 'high',
      message: `Gross less the listed deductions is KSh ${moneyText(expectedNet)} but the payslip shows net KSh ${moneyText(input.netCents)}.`
    });
  }
  if (input.deductions.length === 0) flags.push({ code: 'no_deductions', severity: 'warn', message: 'No deductions are listed. Most employees have at least tax and a pension or health contribution.' });
  if (input.deductions.some((d) => d.amountCents <= 0)) flags.push({ code: 'zero_deduction', severity: 'info', message: 'A listed deduction is zero or negative.' });
  const names = input.deductions.map((d) => d.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) flags.push({ code: 'repeated_deduction', severity: 'warn', message: 'The same deduction name appears more than once.' });
  if (input.grossCents > 0 && totalDeductions / input.grossCents > 0.6) flags.push({ code: 'heavy_deductions', severity: 'info', message: 'Deductions take more than 60% of gross pay.' });
  if (input.month && !/^\d{4}-\d{2}$/.test(input.month)) flags.push({ code: 'month_format', severity: 'info', message: 'The payslip month was not given as YYYY-MM.' });
  return flags;
}

/**
 * Format checks on a Kenyan national ID number. These are heuristics: ID numbers are commonly 7 or 8 digits, so another
 * length is worth a second look, but that is not a rule and old or foreign documents differ.
 */
export function checkNationalId(idNumber: string, recordedIdNumber?: string | null): Flag[] {
  const flags: Flag[] = [];
  const id = idNumber.trim();
  if (!/^\d+$/.test(id)) flags.push({ code: 'not_numeric', severity: 'warn', message: 'A national ID number is digits only; this has other characters (it may be a passport).' });
  else if (id.length < 7 || id.length > 8) flags.push({ code: 'unusual_length', severity: 'warn', message: `National ID numbers are commonly 7 or 8 digits; this has ${id.length}.` });
  if (/^(\d)\1+$/.test(id)) flags.push({ code: 'repeated_digit', severity: 'high', message: 'Every digit is the same.' });
  if (/^(0123456789|1234567890|12345678|1234567)$/.test(id)) flags.push({ code: 'sequence', severity: 'high', message: 'The number is a simple sequence.' });
  if (recordedIdNumber && recordedIdNumber !== id) flags.push({ code: 'differs_from_record', severity: 'high', message: `The member record holds ${recordedIdNumber}, not ${id}.` });
  return flags;
}
