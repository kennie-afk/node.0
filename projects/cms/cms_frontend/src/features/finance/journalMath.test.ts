import { describe, expect, it } from 'vitest';
import { blankLine, checkEntry, type DraftLine } from './journalMath';

const line = (over: Partial<DraftLine>): DraftLine => ({ ...blankLine(1), accountId: 10, ...over });

describe('checkEntry', () => {
  it('accepts a balanced two-line entry in one fund', () => {
    const r = checkEntry([line({ debit: '1500.50' }), line({ accountId: 11, credit: '1500.50' })]);
    expect(r.balanced).toBe(true);
    expect(r.difference).toBe(0);
    expect(r.problems).toEqual([]);
  });

  it('does not suffer floating point drift', () => {
    const r = checkEntry([line({ debit: '0.10' }), line({ debit: '0.20' }), line({ accountId: 11, credit: '0.30' })]);
    expect(r.difference).toBe(0);
    expect(r.balanced).toBe(true);
  });

  it('reports the difference when debits and credits disagree', () => {
    const r = checkEntry([line({ debit: '100.00' }), line({ accountId: 11, credit: '99.99' })]);
    expect(r.balanced).toBe(false);
    expect(r.problems.join(' ')).toContain('differ by 0.01');
  });

  it('insists every fund balances on its own even when the total does', () => {
    const r = checkEntry([line({ debit: '50.00', fundId: 1 }), line({ accountId: 11, credit: '50.00', fundId: 2 })]);
    expect(r.balanced).toBe(false);
    expect(r.problems.join(' ')).toContain('Each fund must balance');
  });

  it('flags a line with both sides, a missing account and a single line', () => {
    const r = checkEntry([line({ accountId: null, debit: '5.00', credit: '5.00' })]);
    expect(r.problems.join(' ')).toContain('choose an account');
    expect(r.problems.join(' ')).toContain('not both');
    expect(r.problems.join(' ')).toContain('at least two lines');
  });

  it('ignores untouched blank lines', () => {
    const r = checkEntry([line({ debit: '10.00' }), line({ accountId: 11, credit: '10.00' }), blankLine(), blankLine()]);
    expect(r.balanced).toBe(true);
  });
});
