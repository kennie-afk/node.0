import { describe, expect, it } from 'vitest';
import { addMoney, compareMoney, formatMoney, fromMinor, normalizeMoneyInput, percent, sanitizeMoneyInput, sumMoney, toMinor, formatDate } from './format';

describe('money is integer minor units, never floats', () => {
  it('converts decimal strings to cents and back without drift', () => {
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('1234.5')).toBe(123450);
    expect(toMinor('-12.05')).toBe(-1205);
    expect(fromMinor(123450)).toBe('1234.50');
    expect(fromMinor(-5)).toBe('-0.05');
  });

  it('adds exactly where floats would not (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(sumMoney(['0.10', '0.20', null, '1000000.01'])).toBe('1000000.31');
    expect(compareMoney('10.00', '9.99')).toBe(1);
  });

  it('rejects amounts with more than two decimals or junk', () => {
    expect(() => toMinor('1.005')).toThrow();
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor('')).toThrow();
  });

  it('formats with grouping, currency and negatives', () => {
    expect(formatMoney('1234567.5')).toBe('KES 1,234,567.50');
    expect(formatMoney('1234567.5', { showCurrency: false })).toBe('1,234,567.50');
    expect(formatMoney('-2500.75')).toBe('-KES 2,500.75');
    expect(formatMoney('-2500.75', { negative: 'parens', showCurrency: false })).toBe('(2,500.75)');
    expect(formatMoney('0', { dashForZero: true })).toBe('-');
    expect(formatMoney(null)).toBe('KES 0.00');
  });

  it('filters what a money field accepts while typing and pads on blur', () => {
    expect(sanitizeMoneyInput('KES 1,2a3.456.7')).toBe('123.45');
    expect(sanitizeMoneyInput('12.')).toBe('12.');
    expect(normalizeMoneyInput('12')).toBe('12.00');
    expect(normalizeMoneyInput('.5')).toBe('0.50');
    expect(normalizeMoneyInput('007.1')).toBe('7.10');
    expect(normalizeMoneyInput('.')).toBe('');
  });

  it('computes percentages from integer cents', () => {
    expect(percent('25.00', '100.00')).toBe(25);
    expect(percent('1.00', '3.00')).toBe(33.3);
    expect(percent('5.00', '0.00')).toBe(0);
  });
});

describe('dates stay strings', () => {
  it('formats YYYY-MM-DD and timestamps without timezone drift', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026');
    expect(formatDate('2026-01-05T23:59:59.000Z')).toBe('5 Jan 2026');
    expect(formatDate(null)).toBe('-');
  });
});
