const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  CONTRIBUTION: 'Giving',
  BATCH: 'Giving batch',
  MPESA: 'M-Pesa',
  BILL: 'Bill',
  BILL_PAYMENT: 'Bill payment',
  PAYROLL: 'Payroll',
  PAYROLL_PAY: 'Payroll payment',
  PAYROLL_REMIT: 'Statutory remittance',
  PETTY_CASH: 'Petty cash',
  REVERSAL: 'Reversal',
  CLOSING: 'Year-end close',
  TRANSFER: 'Fund transfer',
  BANK: 'Bank'
};
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source.replace(/_/g, ' ').toLowerCase();


export const yearsBack = (count = 6): number[] => {
  const now = new Date().getUTCFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
};

export const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Bank transfer', 'Cheque', 'Card'];
