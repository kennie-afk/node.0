/**
 * Deduction tables. Sojaa asserts NO statutory rate as fact: every number below arrives from a table the firm entered (or adopted from
 * the illustrative starter set, which nobody has verified) and a named person confirmed. These are the shapes and the arithmetic only.
 */
import { z } from 'zod';

export const KINDS = ['nssf', 'sha', 'housing', 'paye'] as const;
export type DeductionKind = (typeof KINDS)[number];

const bp = z.number().int().min(0).max(10_000);
const cents = z.number().int().min(0).max(100_000_000_000);

export const nssfSchema = z.object({ employeeRateBp: bp, employerRateBp: bp, upperLimitCents: cents.nullable() });
export const shaSchema = z.object({ employeeRateBp: bp, employerRateBp: bp, minCents: cents, maxCents: cents.nullable() });
export const housingSchema = z.object({ employeeRateBp: bp, employerRateBp: bp });
export const payeSchema = z.object({
  bands: z.array(z.object({ upToCents: cents.nullable(), rateBp: bp })).min(1).max(12),
  personalReliefCents: cents,
  /** which employee deductions are subtracted from gross pay before tax is worked out */
  taxableDeducts: z.array(z.enum(['nssf', 'sha', 'housing'])).max(3)
});

export const SCHEMAS = { nssf: nssfSchema, sha: shaSchema, housing: housingSchema, paye: payeSchema } as const;

export type NssfConfig = z.infer<typeof nssfSchema>;
export type ShaConfig = z.infer<typeof shaSchema>;
export type HousingConfig = z.infer<typeof housingSchema>;
export type PayeConfig = z.infer<typeof payeSchema>;

export function validateConfig(kind: DeductionKind, config: unknown): unknown {
  const parsed = SCHEMAS[kind].safeParse(config);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`${kind}: ${first?.path.join('.') || 'config'} ${first?.message ?? 'is not valid'}`);
  }
  if (kind === 'paye') {
    const bands = (parsed.data as PayeConfig).bands;
    bands.forEach((band, i) => {
      if (band.upToCents === null && i !== bands.length - 1) throw new Error('paye: only the last band may have no upper limit');
      if (i > 0 && band.upToCents !== null && bands[i - 1]!.upToCents !== null && band.upToCents <= bands[i - 1]!.upToCents!) throw new Error('paye: band limits must increase');
    });
    if (bands[bands.length - 1]!.upToCents !== null) throw new Error('paye: the last band must have no upper limit');
  }
  return parsed.data;
}

export interface TableState {
  kind: DeductionKind;
  status: 'unconfirmed' | 'confirmed' | 'not_applicable';
  source: 'none' | 'illustrative_unverified' | 'firm_entered';
  config: unknown;
}

export interface DeductionLine {
  kind: DeductionKind;
  label: string;
  employeeCents: number;
  employerCents: number;
  /** false when the table was unconfirmed or not applicable: nothing was deducted */
  applied: boolean;
}

const take = (amount: number, rateBp: number) => Math.round((amount * rateBp) / 10_000);

export function progressiveTax(taxableCents: number, config: PayeConfig): number {
  let remaining = Math.max(0, taxableCents);
  let lower = 0;
  let tax = 0;
  for (const band of config.bands) {
    if (remaining <= 0) break;
    const width = band.upToCents === null ? remaining : Math.min(remaining, band.upToCents - lower);
    tax += take(width, band.rateBp);
    remaining -= width;
    if (band.upToCents !== null) lower = band.upToCents;
  }
  return Math.max(0, tax - config.personalReliefCents);
}

const LABEL: Record<DeductionKind, string> = { nssf: 'NSSF', sha: 'SHA', housing: 'Housing levy', paye: 'PAYE' };

/** Only a confirmed table deducts. An unconfirmed or not-applicable one yields a zero line that says so. */
export function applyDeductions(grossCents: number, tables: readonly TableState[]): DeductionLine[] {
  const by = new Map(tables.map((t) => [t.kind, t]));
  const live = (kind: DeductionKind) => {
    const t = by.get(kind);
    return t && t.status === 'confirmed' ? t : null;
  };
  const lines: DeductionLine[] = [];
  const employee: Partial<Record<DeductionKind, number>> = {};

  const nssf = live('nssf');
  if (nssf) {
    const c = nssf.config as NssfConfig;
    const base = c.upperLimitCents === null ? grossCents : Math.min(grossCents, c.upperLimitCents);
    employee.nssf = take(base, c.employeeRateBp);
    lines.push({ kind: 'nssf', label: LABEL.nssf, employeeCents: employee.nssf, employerCents: take(base, c.employerRateBp), applied: true });
  } else lines.push({ kind: 'nssf', label: LABEL.nssf, employeeCents: 0, employerCents: 0, applied: false });

  const sha = live('sha');
  if (sha) {
    const c = sha.config as ShaConfig;
    const clamp = (v: number) => Math.min(c.maxCents ?? Infinity, Math.max(c.minCents, v));
    employee.sha = clamp(take(grossCents, c.employeeRateBp));
    lines.push({ kind: 'sha', label: LABEL.sha, employeeCents: employee.sha, employerCents: take(grossCents, c.employerRateBp), applied: true });
  } else lines.push({ kind: 'sha', label: LABEL.sha, employeeCents: 0, employerCents: 0, applied: false });

  const housing = live('housing');
  if (housing) {
    const c = housing.config as HousingConfig;
    employee.housing = take(grossCents, c.employeeRateBp);
    lines.push({ kind: 'housing', label: LABEL.housing, employeeCents: employee.housing, employerCents: take(grossCents, c.employerRateBp), applied: true });
  } else lines.push({ kind: 'housing', label: LABEL.housing, employeeCents: 0, employerCents: 0, applied: false });

  const paye = live('paye');
  if (paye) {
    const c = paye.config as PayeConfig;
    const taxable = grossCents - c.taxableDeducts.reduce((sum, k) => sum + (employee[k] ?? 0), 0);
    lines.push({ kind: 'paye', label: LABEL.paye, employeeCents: progressiveTax(taxable, c), employerCents: 0, applied: true });
  } else lines.push({ kind: 'paye', label: LABEL.paye, employeeCents: 0, employerCents: 0, applied: false });

  return lines;
}

/**
 * A starter set so a trial is not empty. ILLUSTRATIVE ONLY and UNVERIFIED: these figures are from general knowledge, were not checked
 * against KRA, NSSF or SHA publications by this project, and the console says so beside them. They load as 'unconfirmed'; nobody's pay is
 * computed with them until a person confirms them.
 */
export const ILLUSTRATIVE: Record<DeductionKind, unknown> = {
  nssf: { employeeRateBp: 600, employerRateBp: 600, upperLimitCents: 7_200_000 },
  sha: { employeeRateBp: 275, employerRateBp: 0, minCents: 30_000, maxCents: null },
  housing: { employeeRateBp: 150, employerRateBp: 150 },
  paye: {
    bands: [
      { upToCents: 2_400_000, rateBp: 1000 },
      { upToCents: 3_233_300, rateBp: 2500 },
      { upToCents: 50_000_000, rateBp: 3000 },
      { upToCents: 80_000_000, rateBp: 3250 },
      { upToCents: null, rateBp: 3500 }
    ],
    personalReliefCents: 240_000,
    taxableDeducts: ['nssf', 'housing']
  }
};
