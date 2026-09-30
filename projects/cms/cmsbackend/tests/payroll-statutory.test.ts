import { describe, expect, it } from 'vitest';
import { rateSetFor } from '../src/modules/payroll/rates';
import { calculatePay, nssf, payeBeforeRelief, shif } from '../src/modules/payroll/statutory';

const set = rateSetFor(2026, 3);
const KES = (n: number) => Math.round(n * 100);

describe('rate selection', () => {
  it('uses the set in force for the month and refuses months before any recorded set', () => {
    expect(rateSetFor(2025, 2).nssf.upperLimitMinor).toBe(KES(72_000));
    expect(rateSetFor(2025, 12).nssf.upperLimitMinor).toBe(KES(72_000));
    expect(rateSetFor(2026, 1).nssf.upperLimitMinor).toBe(KES(72_000));
    expect(rateSetFor(2026, 2).nssf.upperLimitMinor).toBe(KES(108_000));
    expect(() => rateSetFor(2024, 6)).toThrow(/not supported/);
  });
});

describe('NSSF', () => {
  it('charges 6% in two tiers, capped at the upper limit', () => {
    expect(nssf(KES(6_000), set)).toEqual({ tier1: KES(360), tier2: 0, total: KES(360) });
    expect(nssf(KES(9_000), set).total).toBe(KES(540));
    expect(nssf(KES(50_000), set)).toEqual({ tier1: KES(540), tier2: KES(2_460), total: KES(3_000) });
    expect(nssf(KES(108_000), set).total).toBe(KES(6_480)); // tier I 540 + tier II 5,940
    expect(nssf(KES(500_000), set).total).toBe(KES(6_480));
  });
});

describe('SHIF', () => {
  it('is 2.75% of gross with a KES 300 floor', () => {
    expect(shif(KES(50_000), set)).toBe(KES(1_375));
    expect(shif(KES(5_000), set)).toBe(KES(300));
    expect(shif(KES(10_909), set)).toBe(30_000);
    expect(shif(1_090_910, set)).toBe(30_000); // 2.75% = 300.00025 -> rounds to 300.00
    expect(shif(KES(10_910), set)).toBe(30_003); // 2.75% = 300.025 -> 300.03 (half up)
  });
});

describe('PAYE bands', () => {
  it('is nil at or below 24,000 after personal relief', () => {
    expect(payeBeforeRelief(KES(24_000), set.payeBands)).toBe(KES(2_400));
  });
  it('applies 25% to the next 8,333', () => {
    expect(payeBeforeRelief(KES(32_333), set.payeBands)).toBe(KES(2_400) + 208_325);
  });
  it('crosses every band (hand worked)', () => {
    // 800,000 taxable: 2,400 + 2,083.25 + 467,667*30% (140,300.10) + 300,000*32.5% (97,500) = 242,283.35 is for 800k? band 4 tops at 800,000.
    const at800k = KES(2_400) + 208_325 + 14_030_010 + 9_750_000;
    expect(payeBeforeRelief(KES(800_000), set.payeBands)).toBe(at800k);
    expect(payeBeforeRelief(KES(900_000), set.payeBands)).toBe(at800k + KES(35_000));
  });
});

describe('a whole payslip', () => {
  it('KES 50,000 basic, no extras (hand worked)', () => {
    // gross 50,000; NSSF 3,000; SHIF 1,375; AHL 750 -> taxable 44,875
    // tax: 2,400 + 2,083.25 + (44,875-32,333=12,542)*30% = 3,762.60 => 8,245.85; less relief 2,400 => 5,845.85
    const r = calculatePay({ basicMinor: KES(50_000), allowances: [], deductions: [] }, set);
    expect(r.grossMinor).toBe(KES(50_000));
    expect(r.nssfEmployeeMinor).toBe(KES(3_000));
    expect(r.shifMinor).toBe(KES(1_375));
    expect(r.housingLevyEmployeeMinor).toBe(KES(750));
    expect(r.taxablePayMinor).toBe(KES(44_875));
    expect(r.payeBeforeReliefMinor).toBe(824_585);
    expect(r.payeMinor).toBe(584_585);
    expect(r.netMinor).toBe(KES(50_000) - KES(3_000) - KES(1_375) - KES(750) - 584_585);
    expect(r.employerCostMinor).toBe(KES(50_000) + KES(3_000) + KES(750));
  });

  it('a low salary pays no PAYE (relief exceeds tax) and never goes negative', () => {
    const r = calculatePay({ basicMinor: KES(20_000), allowances: [], deductions: [] }, set);
    // NSSF 1,200 (540+660), SHIF 550, AHL 300 -> taxable 17,950 -> tax 1,795 < 2,400
    expect(r.nssfEmployeeMinor).toBe(KES(1_200));
    expect(r.taxablePayMinor).toBe(KES(17_950));
    expect(r.payeMinor).toBe(0);
  });

  it('non-taxable allowances count for gross and levies but not for tax', () => {
    const r = calculatePay(
      { basicMinor: KES(40_000), allowances: [{ name: 'Housing', amountMinor: KES(10_000), taxable: true }, { name: 'Travel', amountMinor: KES(5_000), taxable: false }], deductions: [{ name: 'Sacco', amountMinor: KES(2_000) }], advanceRecoveryMinor: KES(1_000) },
      set
    );
    expect(r.grossMinor).toBe(KES(55_000));
    // taxable = 50,000 - NSSF 3,360 (540 + 46,000*6%=2,760 -> 3,300? gross 55,000: 540 + 46,000*.06=2,760 => 3,300) - SHIF 1,512.50 - AHL 825
    expect(r.nssfEmployeeMinor).toBe(KES(3_300));
    expect(r.shifMinor).toBe(151_250);
    expect(r.housingLevyEmployeeMinor).toBe(KES(825));
    expect(r.taxablePayMinor).toBe(KES(50_000) - KES(3_300) - 151_250 - KES(825));
    expect(r.otherDeductionsMinor).toBe(KES(2_000));
    expect(r.netMinor).toBe(KES(55_000) - r.totalDeductionsMinor);
  });

  it('insurance relief is 15% of premiums, capped at 5,000 a month', () => {
    const base = calculatePay({ basicMinor: KES(100_000), allowances: [], deductions: [] }, set);
    const small = calculatePay({ basicMinor: KES(100_000), allowances: [], deductions: [], insurancePremiumMinor: KES(10_000) }, set);
    const big = calculatePay({ basicMinor: KES(100_000), allowances: [], deductions: [], insurancePremiumMinor: KES(100_000) }, set);
    expect(base.payeMinor - small.payeMinor).toBe(KES(1_500));
    expect(base.payeMinor - big.payeMinor).toBe(KES(5_000));
  });

  it('every component is an integer number of cents', () => {
    for (const basic of [KES(12_345.67), KES(33_333.33), KES(77_777.77), KES(250_000.01)]) {
      const r = calculatePay({ basicMinor: basic, allowances: [], deductions: [] }, set);
      for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
      expect(r.netMinor + r.totalDeductionsMinor).toBe(r.grossMinor);
    }
  });
});
