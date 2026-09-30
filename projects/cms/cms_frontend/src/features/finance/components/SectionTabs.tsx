import { Tabs } from '../../../ui';

const make = (items: Array<[string, string]>) => items.map(([key, label]) => ({ key, label, to: key }));

type Sections = Record<string, Array<{ key: string; label: string; to: string }>>;

const SECTIONS: Sections = {
  giving: make([
    ['/giving/contributions', 'Gifts'],
    ['/giving/batches', 'Counting batches'],
    ['/giving/pledges', 'Pledges'],
    ['/giving/campaigns', 'Campaigns'],
    ['/giving/recurring', 'Recurring'],
    ['/giving/mpesa', 'M-Pesa inbox'],
    ['/giving/types', 'Giving types'],
    ['/giving/statements', 'Statements']
  ]),
  ledger: make([
    ['/finance/journal', 'Journal'],
    ['/finance/accounts', 'Chart of accounts'],
    ['/finance/funds', 'Funds'],
    ['/finance/periods', 'Periods'],
    ['/finance/audit', 'Audit & integrity'],
    ['/finance/settings', 'Settings']
  ]),
  payables: make([
    ['/payables/bills', 'Bills'],
    ['/payables/vendors', 'Vendors'],
    ['/payables/petty-cash', 'Petty cash'],
    ['/payables/aging', 'Aging']
  ]),
  banking: make([
    ['/banking/accounts', 'Accounts'],
    ['/banking/reconciliations', 'Reconciliations']
  ]),
  payroll: make([
    ['/payroll/runs', 'Pay runs'],
    ['/payroll/employees', 'Employees'],
    ['/payroll/advances', 'Advances'],
    ['/payroll/statutory', 'Statutory'],
    ['/payroll/rates', 'Rates']
  ]),
  reports: make([
    ['/reports', 'All reports']
  ])
};

/** Route-link tabs that tie the screens of one area together. */
export function SectionTabs({ section, active }: { section: keyof typeof SECTIONS; active: string }) {
  return <Tabs tabs={SECTIONS[section as string]} active={active} label={`${String(section)} sections`} />;
}
