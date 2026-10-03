import { describe, expect, it } from 'vitest';
import { Gs1Error, gs1CheckDigit, gs1Date, normaliseGtin, parseScan } from '../src/gs1/parse';

// 0614141999996 is the GS1 specification's own example GTIN-13 (check digit 6).
const GTIN14 = '00614141999996';

describe('GTIN check digits (GS1 mod 10)', () => {
  it('computes the check digit of the GS1 specification example', () => {
    expect(gs1CheckDigit('0061414199999')).toBe(6);
  });
  it('pads 8, 12 and 13 digit codes to 14 and validates them', () => {
    expect(normaliseGtin('0614141999996')).toBe(GTIN14);
    expect(normaliseGtin('614141999996'.slice(0, 11) + '6')).toHaveLength(14);
    expect(normaliseGtin('96385074')).toBe('00000096385074'); // EAN-8 example from GS1
  });
  it('refuses a mistyped code and a wrong length', () => {
    expect(() => normaliseGtin('0614141999997')).toThrow(/check digit/);
    expect(() => normaliseGtin('12345')).toThrow(/8, 12, 13 or 14/);
    expect(() => normaliseGtin('06141419999AB')).toThrow(Gs1Error);
  });
});

describe('GS1 dates', () => {
  it('reads YYMMDD as 20YY', () => expect(gs1Date('271231')).toBe('2027-12-31'));
  it('treats day 00 as the last day of the month, leap years included', () => {
    expect(gs1Date('270200')).toBe('2027-02-28');
    expect(gs1Date('280200')).toBe('2028-02-29');
    expect(gs1Date('270400')).toBe('2027-04-30');
  });
  it('rejects impossible dates', () => {
    expect(() => gs1Date('271332')).toThrow(/month/);
    expect(() => gs1Date('270231')).toThrow(/day/);
    expect(() => gs1Date('27123')).toThrow();
  });
});

describe('parsing what a scanner sends', () => {
  const GS = '\u001d';
  it('reads a bracketed human-readable element string', () => {
    const scan = parseScan(`(01)${GTIN14}(17)271231(10)LOT42(21)SN0001`);
    expect(scan).toMatchObject({ format: 'gs1', gtin: GTIN14, expiryDate: '2027-12-31', batchNo: 'LOT42', serial: 'SN0001' });
  });
  it('reads a raw element string with GS separators, with or without the symbology identifier', () => {
    const raw = `01${GTIN14}17271231` + `10LOT42${GS}21SN0001`;
    expect(parseScan(raw)).toMatchObject({ gtin: GTIN14, batchNo: 'LOT42', serial: 'SN0001' });
    expect(parseScan(`]d2${raw}`)).toMatchObject({ gtin: GTIN14, serial: 'SN0001' });
  });
  it('accepts the separator spelt "|" or "<GS>" for scanners whose input box swallows the control character', () => {
    expect(parseScan(`01${GTIN14}1727123110LOT42|21SN0001`)).toMatchObject({ batchNo: 'LOT42', serial: 'SN0001' });
    expect(parseScan(`01${GTIN14}1727123110LOT42<GS>21SN0001`)).toMatchObject({ batchNo: 'LOT42', serial: 'SN0001' });
  });
  it('does not guess when a scanner drops the separator between two variable fields', () => {
    expect(() => parseScan(`01${GTIN14}17271231` + '10LOT42ABCDEFGHIJKLMNOP21SN0001XYZ')).toThrow(/separator/);
  });
  it('reads a plain retail barcode as a GTIN only', () => {
    expect(parseScan('0614141999996')).toMatchObject({ format: 'retail', gtin: GTIN14, batchNo: null, serial: null });
  });
  it('refuses unknown identifiers, duplicates, bad check digits, bad characters and empty scans', () => {
    expect(() => parseScan('99ABC')).toThrow(/unknown application identifier/);
    expect(() => parseScan(`(01)${GTIN14}(01)${GTIN14}`)).toThrow(/twice/);
    expect(() => parseScan('(01)00614141999995')).toThrow(/check digit/);
    expect(() => parseScan(`(01)${GTIN14}(10)BAD LOT`)).toThrow(/characters/);
    expect(() => parseScan('   ')).toThrow(/nothing was scanned/);
    expect(() => parseScan(`(01)${GTIN14}(17)2713`)).toThrow();
  });
  it('keeps the batch and serial exactly as printed, case included', () => {
    expect(parseScan(`(01)${GTIN14}(10)aB-1.2/3(21)xY9`)).toMatchObject({ batchNo: 'aB-1.2/3', serial: 'xY9' });
  });
});
