import { describe, expect, it } from 'vitest';
import { annualOf, splitAnnual } from './budgetMath';

describe('splitAnnual', () => {
  it('splits evenly when divisible', () => {
    expect(splitAnnual('1200.00')).toEqual(Array(12).fill('100.00'));
  });
  it('never loses or invents a cent', () => {
    const months = splitAnnual('400000.00');
    expect(annualOf(months)).toBe('400000.00');
    expect(splitAnnual('100.01').reduce((s, m) => s + Math.round(Number(m) * 100), 0)).toBe(10001);
  });
  it('handles an empty amount', () => {
    expect(splitAnnual('')).toEqual(Array(12).fill('0.00'));
  });
});
