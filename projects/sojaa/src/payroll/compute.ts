/**
 * One guard's pay for one calendar month, as a pure function. No rate in here is law: the minimum, the divisor, the multipliers and
 * every deduction come from the firm's settings and confirmed tables (see docs/PAYROLL-RULES.md).
 *
 *  basic       monthly basic x days employed in the month / days in the month
 *  allowance   the same proration
 *  premium     minutes worked on a public holiday or on the guard's weekly rest day, x hourly rate x that day's multiplier, IN ADDITION to basic
 *              (a PLACEHOLDER convention: a firm whose contracts say otherwise sets the multiplier to match)
 *  overtime    approved overtime minutes (and never more than were actually worked beyond the shift) x hourly rate x overtime multiplier
 *  hourly rate monthly basic / standard monthly hours
 *
 * The minimum-wage test compares the guard's PRORATED contractual pay (basic, plus allowances only if the firm says they count)
 * with the prorated minimum. Overtime and premiums never count toward the minimum.
 */
import { applyDeductions, DeductionLine, TableState } from './deductions';
import { splitByLocalDay } from '../common/time';

export interface GuardPay {
  id: string;
  monthlyBasicCents: number;
  allowanceCents: number;
  /** 0 = Sunday .. 6 = Saturday */
  restWeekday: number | null;
  hiredOn: string;
  exitedOn: string | null;
  nationalId: string | null;
  nssfNo: string | null;
  shaNo: string | null;
  kraPin: string | null;
  psraRegNo: string | null;
  psraExpiry: string | null;
}

export interface PaySettings {
  minWageCents: number;
  allowancesCountTowardMin: boolean;
  standardMonthlyHours: number;
  overtimeMultiplierBp: number;
  restDayMultiplierBp: number;
  holidayMultiplierBp: number;
  /** the employer's own choice, off unless switched on; see migration 0010 */
  absenceDeduction?: 'off' | 'unpaid_leave' | 'unpaid_leave_and_missed';
}

export interface WorkedShift {
  /** the local calendar day the shift started, YYYY-MM-DD (used when windowStart is not given) */
  day: string;
  /**
   * When the regular minutes begin (the later of check-in and scheduled start). Given, a shift that crosses midnight is split by Nairobi
   * calendar day, so a night shift running into a public holiday or a rest day earns the premium for the minutes on that day.
   */
  windowStart?: Date;
  workedMinutes: number;
  scheduledMinutes: number;
  overtimeApprovedMinutes: number;
}

/** Days in the month a guard was away without pay, as counted from approved unpaid leave and from missed shifts. */
export interface Absence {
  unpaidLeaveDays: number;
  missedShiftDays: number;
}

export interface Flag {
  code: string;
  severity: 'block' | 'warn';
  message: string;
}

export interface Payslip {
  daysInMonth: number;
  daysEmployed: number;
  basicCents: number;
  allowanceCents: number;
  premiumCents: number;
  overtimeCents: number;
  adjustmentsCents: number;
  absenceDeductionCents: number;
  grossCents: number;
  deductions: DeductionLine[];
  employeeDeductionsCents: number;
  netCents: number;
  employerCostCents: number;
  minRequiredCents: number;
  belowMinimum: boolean;
  flags: Flag[];
  breakdown: { premiumMinutes: { holiday: number; restDay: number }; overtimeMinutes: number; hourlyRateCents: number; shifts: number; absence?: Absence & { mode: string; deductedDays: number } };
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Calendar days of `month` the guard was employed (hired on or before, not exited before), inclusive. */
export function daysEmployed(month: string, hiredOn: string, exitedOn: string | null): number {
  const dim = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(dim).padStart(2, '0')}`;
  const from = hiredOn > first ? hiredOn : first;
  const to = exitedOn && exitedOn < last ? exitedOn : last;
  if (to < from) return 0;
  return Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
}

export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();

const prorate = (cents: number, days: number, dim: number) => Math.round((cents * days) / dim);

export function computePayslip(input: {
  guard: GuardPay;
  month: string;
  settings: PaySettings;
  holidays: ReadonlySet<string>;
  shifts: readonly WorkedShift[];
  adjustmentsCents: number;
  absence?: Absence;
  tables: readonly TableState[];
  today?: string;
}): Payslip {
  const { guard, month, settings, holidays } = input;
  const dim = daysInMonth(month);
  const employed = daysEmployed(month, guard.hiredOn, guard.exitedOn);
  const basic = prorate(guard.monthlyBasicCents, employed, dim);
  const allowance = prorate(guard.allowanceCents, employed, dim);
  const hourly = guard.monthlyBasicCents / settings.standardMonthlyHours;

  let holidayMin = 0;
  let restMin = 0;
  let overtimeMin = 0;
  for (const shift of input.shifts) {
    const regular = Math.min(shift.workedMinutes, shift.scheduledMinutes);
    overtimeMin += Math.min(shift.overtimeApprovedMinutes, Math.max(0, shift.workedMinutes - shift.scheduledMinutes));
    const parts = shift.windowStart ? splitByLocalDay(shift.windowStart, regular) : [{ day: shift.day, minutes: regular }];
    for (const part of parts) {
      if (holidays.has(part.day)) holidayMin += part.minutes;
      else if (guard.restWeekday !== null && weekdayOf(part.day) === guard.restWeekday) restMin += part.minutes;
    }
  }
  const premium = Math.round(((holidayMin * settings.holidayMultiplierBp + restMin * settings.restDayMultiplierBp) / 10_000 / 60) * hourly);
  const overtime = Math.round(((overtimeMin * settings.overtimeMultiplierBp) / 10_000 / 60) * hourly);

  // Absence: only what the employer switched on. Calendar-day proration, the same as a guard hired mid-month; never more than was payable.
  const mode = settings.absenceDeduction ?? 'off';
  const absence = input.absence ?? { unpaidLeaveDays: 0, missedShiftDays: 0 };
  const unpaidDays = Math.min(employed, absence.unpaidLeaveDays);
  const missedDays = Math.min(Math.max(0, employed - unpaidDays), absence.missedShiftDays);
  const deductedDays = mode === 'off' ? 0 : unpaidDays + (mode === 'unpaid_leave_and_missed' ? missedDays : 0);
  const absenceDeduction = Math.min(basic + allowance, prorate(guard.monthlyBasicCents + guard.allowanceCents, deductedDays, dim));

  const gross = basic + allowance + premium + overtime + input.adjustmentsCents - absenceDeduction;
  const deductions = applyDeductions(Math.max(0, gross), input.tables);
  const employee = deductions.reduce((s, d) => s + d.employeeCents, 0);
  const employer = deductions.reduce((s, d) => s + d.employerCents, 0);

  const minRequired = prorate(settings.minWageCents, employed, dim);
  const contractual = basic + (settings.allowancesCountTowardMin ? allowance : 0);
  const belowMinimum = employed > 0 && contractual < minRequired;

  const flags: Flag[] = [];
  if (belowMinimum) flags.push({ code: 'below_minimum', severity: 'block', message: `Contractual pay ${contractual / 100} is below the configured minimum ${minRequired / 100} for ${employed} of ${dim} days.` });
  const notDeducted = [
    mode === 'off' && unpaidDays > 0 ? `${unpaidDays} day(s) of approved unpaid leave` : '',
    mode !== 'unpaid_leave_and_missed' && missedDays > 0 ? `${missedDays} day(s) with a missed shift` : ''
  ].filter(Boolean);
  if (notDeducted.length > 0) flags.push({ code: 'absence_not_deducted', severity: 'warn', message: `Not deducted, because the absence deduction setting does not cover it: ${notDeducted.join(' and ')}.` });
  if (gross - employee < 0) flags.push({ code: 'negative_net', severity: 'block', message: 'Deductions exceed pay: the net is negative.' });
  if (!guard.nationalId) flags.push({ code: 'missing_national_id', severity: 'warn', message: 'No national ID number on record.' });
  const statuses = new Map(input.tables.map((t) => [t.kind, t.status]));
  if (statuses.get('nssf') !== 'not_applicable' && !guard.nssfNo) flags.push({ code: 'missing_nssf_no', severity: 'warn', message: 'No NSSF number on record.' });
  if (statuses.get('sha') !== 'not_applicable' && !guard.shaNo) flags.push({ code: 'missing_sha_no', severity: 'warn', message: 'No SHA number on record.' });
  if (statuses.get('paye') !== 'not_applicable' && !guard.kraPin) flags.push({ code: 'missing_kra_pin', severity: 'warn', message: 'No KRA PIN on record.' });
  if (!guard.psraRegNo) flags.push({ code: 'missing_psra_reg', severity: 'warn', message: 'No PSRA registration number on record.' });
  const today = input.today ?? `${month}-${String(dim).padStart(2, '0')}`;
  if (guard.psraExpiry && guard.psraExpiry < today) flags.push({ code: 'psra_expired', severity: 'warn', message: `PSRA registration expiry ${guard.psraExpiry} has passed (as typed by the firm).` });

  return {
    daysInMonth: dim,
    daysEmployed: employed,
    basicCents: basic,
    allowanceCents: allowance,
    premiumCents: premium,
    overtimeCents: overtime,
    adjustmentsCents: input.adjustmentsCents,
    absenceDeductionCents: absenceDeduction,
    grossCents: gross,
    deductions,
    employeeDeductionsCents: employee,
    netCents: gross - employee,
    employerCostCents: gross + employer,
    minRequiredCents: minRequired,
    belowMinimum,
    flags,
    breakdown: { premiumMinutes: { holiday: holidayMin, restDay: restMin }, overtimeMinutes: overtimeMin, hourlyRateCents: Math.round(hourly), shifts: input.shifts.length, ...(unpaidDays + missedDays > 0 ? { absence: { unpaidLeaveDays: unpaidDays, missedShiftDays: missedDays, mode, deductedDays } } : {}) }
  };
}
