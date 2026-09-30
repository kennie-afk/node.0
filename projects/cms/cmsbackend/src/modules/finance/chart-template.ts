/**
 * The starting chart of accounts for a Kenyan congregation. `key` marks the accounts other parts
 * of the system post to by role (cash, payables, statutory liabilities...), so a church can rename
 * or renumber them without breaking automation.
 */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface TemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  key?: string;
  parent?: string;
  postable?: boolean;
}

export const CHART_TEMPLATE: TemplateAccount[] = [
  { code: '1000', name: 'Assets', type: 'ASSET', postable: false },
  { code: '1010', name: 'Cash on Hand', type: 'ASSET', key: 'CASH', parent: '1000' },
  { code: '1020', name: 'Petty Cash', type: 'ASSET', key: 'PETTY_CASH', parent: '1000' },
  { code: '1100', name: 'Bank - Main Account', type: 'ASSET', key: 'BANK_MAIN', parent: '1000' },
  { code: '1110', name: 'M-Pesa Paybill', type: 'ASSET', key: 'MPESA', parent: '1000' },
  { code: '1200', name: 'Receivables', type: 'ASSET', key: 'RECEIVABLES', parent: '1000' },
  { code: '1210', name: 'Staff Advances', type: 'ASSET', key: 'STAFF_ADVANCES', parent: '1000' },
  { code: '1300', name: 'Prepayments', type: 'ASSET', parent: '1000' },
  { code: '1500', name: 'Land and Buildings', type: 'ASSET', key: 'FIXED_LAND_BUILDINGS', parent: '1000' },
  { code: '1510', name: 'Furniture and Equipment', type: 'ASSET', parent: '1000' },
  { code: '1520', name: 'Vehicles', type: 'ASSET', parent: '1000' },
  { code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', parent: '1000' },
  { code: '1900', name: 'Due from Other Funds', type: 'ASSET', key: 'DUE_FROM_FUNDS', parent: '1000' },

  { code: '2000', name: 'Liabilities', type: 'LIABILITY', postable: false },
  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', key: 'AP', parent: '2000' },
  { code: '2020', name: 'Unallocated Receipts', type: 'LIABILITY', key: 'SUSPENSE', parent: '2000' },
  { code: '2100', name: 'PAYE Payable', type: 'LIABILITY', key: 'PAYE_PAYABLE', parent: '2000' },
  { code: '2110', name: 'NSSF Payable', type: 'LIABILITY', key: 'NSSF_PAYABLE', parent: '2000' },
  { code: '2120', name: 'SHIF Payable', type: 'LIABILITY', key: 'SHIF_PAYABLE', parent: '2000' },
  { code: '2130', name: 'Affordable Housing Levy Payable', type: 'LIABILITY', key: 'HOUSING_LEVY_PAYABLE', parent: '2000' },
  { code: '2140', name: 'Net Salaries Payable', type: 'LIABILITY', key: 'SALARIES_PAYABLE', parent: '2000' },
  { code: '2150', name: 'Other Payroll Deductions Payable', type: 'LIABILITY', key: 'PAYROLL_DEDUCTIONS_PAYABLE', parent: '2000' },
  { code: '2200', name: 'Loans Payable', type: 'LIABILITY', parent: '2000' },
  { code: '2900', name: 'Due to Other Funds', type: 'LIABILITY', key: 'DUE_TO_FUNDS', parent: '2000' },

  { code: '3000', name: 'Net Assets', type: 'EQUITY', postable: false },
  { code: '3010', name: 'Net Assets', type: 'EQUITY', key: 'NET_ASSETS', parent: '3000' },
  { code: '3020', name: 'Opening Balance Equity', type: 'EQUITY', key: 'OPENING_EQUITY', parent: '3000' },
  { code: '3030', name: 'Interfund Transfers', type: 'EQUITY', key: 'INTERFUND_TRANSFERS', parent: '3000' },

  { code: '4000', name: 'Income', type: 'INCOME', postable: false },
  { code: '4010', name: 'Tithes', type: 'INCOME', key: 'INCOME_TITHES', parent: '4000' },
  { code: '4020', name: 'Offerings', type: 'INCOME', key: 'INCOME_OFFERINGS', parent: '4000' },
  { code: '4030', name: 'Thanksgiving', type: 'INCOME', key: 'INCOME_THANKSGIVING', parent: '4000' },
  { code: '4040', name: 'Building Fund Giving', type: 'INCOME', key: 'INCOME_BUILDING', parent: '4000' },
  { code: '4050', name: 'Missions Giving', type: 'INCOME', key: 'INCOME_MISSIONS', parent: '4000' },
  { code: '4060', name: 'Special Seed and Pledges', type: 'INCOME', key: 'INCOME_SPECIAL', parent: '4000' },
  { code: '4100', name: 'Event Income', type: 'INCOME', parent: '4000' },
  { code: '4110', name: 'Rental and Hire Income', type: 'INCOME', parent: '4000' },
  { code: '4120', name: 'Bookshop and Sales', type: 'INCOME', parent: '4000' },
  { code: '4200', name: 'Grants and Donations', type: 'INCOME', key: 'INCOME_GRANTS', parent: '4000' },
  { code: '4900', name: 'Other Income', type: 'INCOME', key: 'INCOME_OTHER', parent: '4000' },

  { code: '5000', name: 'Expenses', type: 'EXPENSE', postable: false },
  { code: '5010', name: 'Salaries and Wages', type: 'EXPENSE', key: 'EXP_SALARIES', parent: '5000' },
  { code: '5020', name: 'Employer NSSF', type: 'EXPENSE', key: 'EXP_NSSF_EMPLOYER', parent: '5000' },
  { code: '5030', name: 'Employer Housing Levy', type: 'EXPENSE', key: 'EXP_HOUSING_EMPLOYER', parent: '5000' },
  { code: '5040', name: 'Pastoral Allowances', type: 'EXPENSE', key: 'EXP_ALLOWANCES', parent: '5000' },
  { code: '5100', name: 'Rent', type: 'EXPENSE', parent: '5000' },
  { code: '5110', name: 'Utilities', type: 'EXPENSE', parent: '5000' },
  { code: '5120', name: 'Repairs and Maintenance', type: 'EXPENSE', parent: '5000' },
  { code: '5130', name: 'Insurance', type: 'EXPENSE', parent: '5000' },
  { code: '5140', name: 'Security', type: 'EXPENSE', parent: '5000' },
  { code: '5200', name: 'Ministry Expenses', type: 'EXPENSE', key: 'EXP_MINISTRY', parent: '5000' },
  { code: '5210', name: 'Youth and Children', type: 'EXPENSE', parent: '5000' },
  { code: '5230', name: 'Worship and Media', type: 'EXPENSE', parent: '5000' },
  { code: '5240', name: 'Outreach and Missions', type: 'EXPENSE', parent: '5000' },
  { code: '5250', name: 'Benevolence and Welfare', type: 'EXPENSE', key: 'EXP_BENEVOLENCE', parent: '5000' },
  { code: '5300', name: 'Office and Administration', type: 'EXPENSE', parent: '5000' },
  { code: '5310', name: 'Printing and Stationery', type: 'EXPENSE', parent: '5000' },
  { code: '5320', name: 'Communication and Airtime', type: 'EXPENSE', parent: '5000' },
  { code: '5330', name: 'Transport', type: 'EXPENSE', parent: '5000' },
  { code: '5340', name: 'Professional Fees', type: 'EXPENSE', parent: '5000' },
  { code: '5350', name: 'Bank and M-Pesa Charges', type: 'EXPENSE', key: 'EXP_BANK_CHARGES', parent: '5000' },
  { code: '5400', name: 'Events and Conferences', type: 'EXPENSE', parent: '5000' },
  { code: '5900', name: 'Depreciation', type: 'EXPENSE', parent: '5000' },
  { code: '5990', name: 'Other Expenses', type: 'EXPENSE', key: 'EXP_OTHER', parent: '5000' }
];

export interface TemplateFund {
  code: string;
  name: string;
  restriction: 'UNRESTRICTED' | 'TEMPORARILY_RESTRICTED' | 'PERMANENTLY_RESTRICTED';
  description: string;
}

export const FUND_TEMPLATE: TemplateFund[] = [
  { code: 'GEN', name: 'General Fund', restriction: 'UNRESTRICTED', description: 'Day-to-day operations' },
  { code: 'BLD', name: 'Building Fund', restriction: 'TEMPORARILY_RESTRICTED', description: 'Construction and capital projects' },
  { code: 'MIS', name: 'Missions Fund', restriction: 'TEMPORARILY_RESTRICTED', description: 'Missions and outreach' },
  { code: 'BEN', name: 'Benevolence Fund', restriction: 'TEMPORARILY_RESTRICTED', description: 'Welfare and emergency assistance' }
];
