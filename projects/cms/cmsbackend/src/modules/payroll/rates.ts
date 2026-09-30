/**
 * Versioned Kenyan statutory rates. A payroll month uses the newest set whose `effectiveFrom` is on
 * or before the first day of that month, so history stays reproducible when a rate changes: add a
 * new set, never edit an old one.
 *
 * All amounts are minor units (cents). Bands are MONTHLY.
 *
 * Verification status (retrieved 2026-09-30, see docs/PAYROLL-RATES.md):
 *   - PAYE bands, personal relief, insurance relief: read directly from the KRA PAYE page.
 *   - NSSF limits (LEL 9,000 / UEL 108,000, 6%), SHIF 2.75% min 300, Housing Levy 1.5%+1.5% and the
 *     pre-tax treatment of NSSF/SHIF/AHL: consistent across several professional/commercial
 *     sources, but NOT read from an NSSF, SHA or Finance Act document. PROVISIONAL until an
 *     accountant confirms them against the official notices before a real payroll is run.
 */
export interface PayeBand {
  /** Upper bound of the band, in monthly minor units; null for the open top band. */
  upTo: number | null;
  /** Rate in basis points (1000 = 10.00%). */
  bps: number;
}

export interface RateSet {
  version: string;
  effectiveFrom: string;
  payeBands: PayeBand[];
  personalReliefMinor: number;
  insuranceReliefBps: number;
  insuranceReliefMaxMinor: number;
  nssf: { rateBps: number; lowerLimitMinor: number; upperLimitMinor: number };
  shif: { rateBps: number; minimumMinor: number };
  housingLevy: { employeeBps: number; employerBps: number };
  /** Is this component subtracted before PAYE is computed? */
  preTax: { nssf: boolean; shif: boolean; housingLevy: boolean };
  sources: Array<{ what: string; url: string; retrieved: string; verified: 'official' | 'secondary' }>;
}

const PAYE_BANDS_2023: PayeBand[] = [
  { upTo: 2_400_000, bps: 1000 },
  { upTo: 3_233_300, bps: 2500 },
  { upTo: 50_000_000, bps: 3000 },
  { upTo: 80_000_000, bps: 3250 },
  { upTo: null, bps: 3500 }
];

const COMMON_SOURCES: RateSet['sources'] = [
  { what: 'PAYE bands, personal relief KES 2,400/month, insurance relief 15% (max KES 60,000/yr), allowable deductions', url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye', retrieved: '2026-09-30', verified: 'official' },
  { what: 'PAYE 2026 bands and relief restated', url: 'https://smarthr.co.ke/blog/kra-paye-tax-bands-kenya-2026', retrieved: '2026-09-30', verified: 'secondary' },
  { what: 'SHIF 2.75% of gross, minimum KES 300; AHL 1.5% employee + 1.5% employer; both pre-tax under Tax Laws (Amendment) Act 2024', url: 'https://serrarigroup.com/kenya-statutory-deductions-2026-nssf-shif-paye-guide/', retrieved: '2026-09-30', verified: 'secondary' }
];

export const RATE_SETS: RateSet[] = [
  {
    version: '2025-02-01',
    effectiveFrom: '2025-02-01',
    payeBands: PAYE_BANDS_2023,
    personalReliefMinor: 240_000,
    insuranceReliefBps: 1500,
    insuranceReliefMaxMinor: 500_000,
    nssf: { rateBps: 600, lowerLimitMinor: 800_000, upperLimitMinor: 7_200_000 },
    shif: { rateBps: 275, minimumMinor: 30_000 },
    housingLevy: { employeeBps: 150, employerBps: 150 },
    preTax: { nssf: true, shif: true, housingLevy: true },
    sources: [
      ...COMMON_SOURCES,
      { what: 'NSSF phase 3 (Feb 2025): LEL 8,000, UEL 72,000, 6%', url: 'https://vialtopartners.com/regional-alerts/kenya-employment-tax-national-social-security-fund-nssf-changes', retrieved: '2026-09-30', verified: 'secondary' }
    ]
  },
  {
    version: '2026-02-01',
    effectiveFrom: '2026-02-01',
    payeBands: PAYE_BANDS_2023,
    personalReliefMinor: 240_000,
    insuranceReliefBps: 1500,
    insuranceReliefMaxMinor: 500_000,
    nssf: { rateBps: 600, lowerLimitMinor: 900_000, upperLimitMinor: 10_800_000 },
    shif: { rateBps: 275, minimumMinor: 30_000 },
    housingLevy: { employeeBps: 150, employerBps: 150 },
    preTax: { nssf: true, shif: true, housingLevy: true },
    sources: [
      ...COMMON_SOURCES,
      { what: 'NSSF phase 4 (Feb 2026): LEL 9,000, UEL 108,000, 6% (Tier II max KES 5,940; Tier I 540; total employee max 6,480)', url: 'https://www.grantthornton.co.ke/insights/tax-alert-1-of-2026/', retrieved: '2026-09-30', verified: 'secondary' },
      { what: 'NSSF Feb 2026 limits restated', url: 'https://www.flexi-personnel.com/new-nssf-rates-feb-2026/', retrieved: '2026-09-30', verified: 'secondary' }
    ]
  }
];

export function rateSetFor(year: number, month: number): RateSet {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const eligible = RATE_SETS.filter((set) => set.effectiveFrom <= first);
  if (eligible.length === 0) {
    throw new Error(`no statutory rates are recorded for ${first}; payroll before ${RATE_SETS[0].effectiveFrom} is not supported`);
  }
  return eligible[eligible.length - 1];
}
