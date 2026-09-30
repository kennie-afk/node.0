import { CsvColumn, toCsv } from './csv';

type Row = Record<string, string | number | null | undefined>;

function table(filename: string, headers: Array<[string, string]>, rows: Row[]) {
  const columns: CsvColumn<Row>[] = headers.map(([header, key]) => ({ header, value: (r) => r[key] }));
  return { filename, body: toCsv(columns, rows) };
}

const money = (report: any) => report;

export function incomeStatementCsv(r: any) {
  const compare = r.prior !== undefined;
  const headers: Array<[string, string]> = [['Section', 'section'], ['Code', 'code'], ['Account', 'name'], ['Amount', 'amount'], ...(compare ? ([['Prior', 'priorAmount'], ['Change', 'change']] as Array<[string, string]>) : [])];
  const rows: Row[] = [
    ...r.income.map((l: any) => ({ section: 'Income', ...l })),
    { section: 'Income', name: 'Total income', amount: r.totalIncome, priorAmount: r.prior?.totalIncome },
    ...r.expenses.map((l: any) => ({ section: 'Expenses', ...l })),
    { section: 'Expenses', name: 'Total expenses', amount: r.totalExpenses, priorAmount: r.prior?.totalExpenses },
    { section: 'Result', name: 'Surplus (deficit)', amount: r.surplus, priorAmount: r.prior?.surplus }
  ];
  return table(`income-statement-${r.from}-${r.to}.csv`, headers, rows);
}

export function balanceSheetCsv(r: any) {
  const rows: Row[] = [
    ...r.assets.map((l: any) => ({ section: 'Assets', ...l })),
    { section: 'Assets', name: 'Total assets', amount: r.totalAssets },
    ...r.liabilities.map((l: any) => ({ section: 'Liabilities', ...l })),
    { section: 'Liabilities', name: 'Total liabilities', amount: r.totalLiabilities },
    ...r.netAssets.map((l: any) => ({ section: 'Net assets', ...l })),
    { section: 'Net assets', name: 'Total net assets', amount: r.totalNetAssets }
  ];
  return table(`balance-sheet-${r.asOf}.csv`, [['Section', 'section'], ['Code', 'code'], ['Account', 'name'], ['Amount', 'amount']], rows);
}

export function cashFlowCsv(r: any) {
  const rows: Row[] = [
    { section: 'Opening cash', label: 'Opening cash', amount: r.openingCash },
    ...r.inflows.map((l: any) => ({ section: 'Inflow', label: l.label, amount: l.amount })),
    ...r.outflows.map((l: any) => ({ section: 'Outflow', label: l.label, amount: `-${l.amount}` })),
    { section: 'Net change', label: 'Net change in cash', amount: r.netChange },
    { section: 'Closing cash', label: 'Closing cash', amount: r.closingCash }
  ];
  return table(`cash-flow-${r.from}-${r.to}.csv`, [['Section', 'section'], ['Item', 'label'], ['Amount', 'amount']], rows);
}

export const fundBalancesCsv = (r: any) =>
  table(`fund-balances-${r.asOf}.csv`, [['Code', 'code'], ['Fund', 'name'], ['Restriction', 'restriction'], ['Cash', 'cash'], ['Total assets', 'totalAssets'], ['Liabilities', 'liabilities'], ['Net assets', 'netAssets']], r.funds);

export const generalLedgerCsv = (r: any) =>
  table(`general-ledger-${r.from}-${r.to}.csv`, [['Code', 'code'], ['Account', 'name'], ['Type', 'type'], ['Opening', 'opening'], ['Debits', 'debits'], ['Credits', 'credits'], ['Closing', 'closing']], r.accounts);

export const registerCsv = (r: any) =>
  table(`register-${r.account.code}.csv`, [['Date', 'date'], ['Entry', 'entryNo'], ['Memo', 'memo'], ['Debit', 'debit'], ['Credit', 'credit'], ['Balance', 'balance']], r.data);

export const byTypeCsv = (r: any) => table(`giving-by-type-${r.from}-${r.to}.csv`, [['Type', 'type'], ['Gifts', 'gifts'], ['Donors', 'donors'], ['Total', 'total'], ['Share %', 'share']], r.types);
export const byMonthCsv = (r: any) => table(`giving-by-month-${r.from}-${r.to}.csv`, [['Month', 'month'], ['Gifts', 'gifts'], ['Donors', 'donors'], ['Total', 'total']], r.months);
export const byFundCsv = (r: any) => table(`giving-by-fund-${r.from}-${r.to}.csv`, [['Code', 'code'], ['Fund', 'name'], ['Restriction', 'restriction'], ['Income', 'income']], r.funds);
export const topGiversCsv = (r: any) => table(`top-givers-${r.from}-${r.to}.csv`, [['Rank', 'rank'], ['Member', 'name'], ['Gifts', 'gifts'], ['Total', 'total'], ['Last gift', 'lastGift']], r.givers);
export const lapsedCsv = (r: any) => table(`lapsed-givers-${r.asOf}.csv`, [['Member', 'name'], ['Email', 'email'], ['Phone', 'phone'], ['Gifts', 'gifts'], ['Total', 'total'], ['Last gift', 'lastGift']], r.givers);
export const retentionCsv = (r: any) =>
  table(`donor-retention-${r.year}.csv`, [['Measure', 'measure'], ['Value', 'value']], [
    { measure: 'Donors last year', value: r.priorYearDonors }, { measure: 'Donors this year', value: r.currentYearDonors }, { measure: 'Retained', value: r.retained },
    { measure: 'Lost', value: r.lost }, { measure: 'New', value: r.newDonors }, { measure: 'Retention %', value: r.retentionRate }
  ]);
export const ministryCsv = (r: any) =>
  table(`expenses-by-ministry-${r.from}-${r.to}.csv`, [['Ministry', 'name'], ['Total', 'total'], ['Share %', 'share']], r.ministries);

void money;
