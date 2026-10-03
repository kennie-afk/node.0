/**
 * The chart of accounts every organisation starts with. The codes in SYSTEM are the ones the product posts to, so they
 * are created as system accounts and cannot be deactivated; everything else (the expense lines, mostly) the accountant
 * can add to. A non-bank lender does not take deposits, so it has no savings or deposits accounts and its equity is
 * called capital, not shares.
 *
 * Interest is recognised when it is received (cash basis); penalties are recognised when they are charged and held as a
 * receivable until paid. Both are documented in docs/ACCOUNTING.md and need an accountant's sign-off before an
 * organisation treats the statements as its audited position.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  system: boolean;
}

export const CODES = {
  cash: '1010',
  mpesa: '1020',
  bank: '1030',
  loans: '1100',
  penaltiesReceivable: '1110',
  savings: '2100',
  deposits: '2200',
  unapplied: '2300',
  payables: '2400',
  borrowings: '2500',
  shares: '3100',
  reserves: '3200',
  retained: '3300',
  openingBalance: '3400',
  interestIncome: '4100',
  penaltyIncome: '4200',
  feeIncome: '4300',
  otherIncome: '4400',
  recoveries: '4500',
  badDebts: '5100',
  salaries: '5200',
  rent: '5300',
  admin: '5400',
  otherExpense: '5900'
} as const;

const COMMON: ChartAccount[] = [
  { code: CODES.cash, name: 'Cash on hand', type: 'asset', system: true },
  { code: CODES.mpesa, name: 'M-Pesa collections', type: 'asset', system: true },
  { code: CODES.bank, name: 'Bank', type: 'asset', system: true },
  { code: CODES.loans, name: 'Loans receivable (principal)', type: 'asset', system: true },
  { code: CODES.penaltiesReceivable, name: 'Penalties receivable', type: 'asset', system: true },
  { code: CODES.unapplied, name: 'Unapplied receipts', type: 'liability', system: true },
  { code: CODES.payables, name: 'Payables', type: 'liability', system: false },
  { code: CODES.borrowings, name: 'Borrowings', type: 'liability', system: false },
  { code: CODES.reserves, name: 'Reserves', type: 'equity', system: false },
  { code: CODES.retained, name: 'Accumulated surplus', type: 'equity', system: true },
  { code: CODES.openingBalance, name: 'Opening balance equity', type: 'equity', system: true },
  { code: CODES.interestIncome, name: 'Interest on loans', type: 'income', system: true },
  { code: CODES.penaltyIncome, name: 'Penalty income', type: 'income', system: true },
  { code: CODES.feeIncome, name: 'Loan fee income', type: 'income', system: true },
  { code: CODES.otherIncome, name: 'Other income', type: 'income', system: false },
  { code: CODES.recoveries, name: 'Bad debts recovered', type: 'income', system: true },
  { code: CODES.badDebts, name: 'Bad debts written off', type: 'expense', system: true },
  { code: CODES.salaries, name: 'Salaries and wages', type: 'expense', system: false },
  { code: CODES.rent, name: 'Rent and utilities', type: 'expense', system: false },
  { code: CODES.admin, name: 'Administration', type: 'expense', system: false },
  { code: CODES.otherExpense, name: 'Other expenses', type: 'expense', system: false }
];

export function defaultChart(kind: 'sacco' | 'lender'): ChartAccount[] {
  if (kind === 'lender') {
    return [...COMMON, { code: CODES.shares, name: 'Owners capital', type: 'equity', system: true }];
  }
  return [
    ...COMMON,
    { code: CODES.savings, name: 'Member savings', type: 'liability', system: true },
    { code: CODES.deposits, name: 'Member deposits', type: 'liability', system: true },
    { code: CODES.shares, name: 'Member share capital', type: 'equity', system: true }
  ];
}

export type Channel = 'cash' | 'mpesa' | 'bank' | 'transfer';

/** The asset account a payment channel settles into. */
export function settlementAccount(channel: Channel): string {
  if (channel === 'cash') return CODES.cash;
  if (channel === 'mpesa') return CODES.mpesa;
  return CODES.bank;
}

/** Debit-normal accounts grow with debits. */
export function debitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}
