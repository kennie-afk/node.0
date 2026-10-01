import { describe, expect, it } from 'vitest';
import { amountInWords } from './words';

describe('amountInWords', () => {
  it('spells whole and fractional amounts', () => {
    expect(amountInWords('500.00')).toBe('Five hundred shillings only');
    expect(amountInWords('12500.50')).toBe('Twelve thousand five hundred shillings and fifty cents only');
    expect(amountInWords('1000001.00')).toBe('One million and one shillings only');
    expect(amountInWords('21.00')).toBe('Twenty-one shillings only');
  });
});
