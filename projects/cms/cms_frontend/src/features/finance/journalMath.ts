import { toMinor, fromMinor } from '../../ui';

export interface DraftLine {
  key: number;
  accountId: number | null;
  fundId: number | null;
  debit: string;
  credit: string;
  memo: string;
}

export interface FundBalance {
  fundId: number | null;
  debit: number;
  credit: number;
  difference: number;
}

export interface EntryBalance {
  debit: number;
  credit: number;
  difference: number;
  perFund: FundBalance[];
  /** Every rule the ledger enforces, checked before the request is sent. */
  problems: string[];
  balanced: boolean;
}

const minor = (value: string): number => {
  if (!value) return 0;
  try {
    return toMinor(value);
  } catch {
    return 0;
  }
};

/**
 * Mirrors the ledger's own checks (two or more lines, one side per line, debits = credits overall
 * and inside every fund) in integer minor units, so the form can say what is wrong as you type
 * instead of after a round trip. The server still enforces all of it.
 */
export function checkEntry(lines: DraftLine[]): EntryBalance {
  const filled = lines.filter((l) => l.accountId || l.debit || l.credit);
  const problems: string[] = [];
  let debit = 0;
  let credit = 0;
  const funds = new Map<number | null, FundBalance>();
  filled.forEach((line, index) => {
    const d = minor(line.debit);
    const c = minor(line.credit);
    if (!line.accountId) problems.push(`Line ${index + 1}: choose an account`);
    if (!line.fundId) problems.push(`Line ${index + 1}: choose a fund`);
    if (d > 0 && c > 0) problems.push(`Line ${index + 1}: enter a debit or a credit, not both`);
    if (d === 0 && c === 0) problems.push(`Line ${index + 1}: enter an amount`);
    debit += d;
    credit += c;
    const slot = funds.get(line.fundId) ?? { fundId: line.fundId, debit: 0, credit: 0, difference: 0 };
    slot.debit += d;
    slot.credit += c;
    slot.difference = slot.debit - slot.credit;
    funds.set(line.fundId, slot);
  });
  if (filled.length < 2) problems.push('An entry needs at least two lines');
  const perFund = [...funds.values()];
  const difference = debit - credit;
  if (difference !== 0) problems.push(`Debits and credits differ by ${fromMinor(Math.abs(difference))}`);
  for (const fund of perFund) {
    if (fund.difference !== 0 && difference === 0) problems.push('Each fund must balance on its own; use a fund transfer to move money between funds');
  }
  return { debit, credit, difference, perFund, problems: [...new Set(problems)], balanced: problems.length === 0 && debit > 0 };
}

let counter = 0;
export const blankLine = (fundId: number | null = null): DraftLine => ({ key: ++counter, accountId: null, fundId, debit: '', credit: '', memo: '' });
