import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../../ui';
import { useAuth } from '../../context/auth-context';

const GROUPS = [
  { title: 'Financial statements', items: [
    ['/reports/income-statement', 'Income statement', 'Income and spending for any period, with a comparison'],
    ['/reports/balance-sheet', 'Balance sheet', 'What the church owns and owes on a date'],
    ['/reports/cash-flow', 'Cash flow', 'Where cash came from and went'],
    ['/reports/fund-balances', 'Fund balances', 'Each fund’s cash, liabilities and net assets'],
    ['/reports/trial-balance', 'Trial balance', 'Every account’s balance; debits equal credits'],
    ['/reports/general-ledger', 'General ledger', 'Opening, movement and closing for every account'],
    ['/reports/expenses-by-ministry', 'Spending by ministry', 'Where the money went, by ministry']
  ], permission: 'finance:read' as const },
  { title: 'Giving', items: [
    ['/reports/giving', 'Giving reports', 'By type, month and fund; top givers; lapsed givers; retention; average gift'],
    ['/giving/statements', 'Member giving statements', 'Printable yearly statement for one member']
  ], permission: 'giving:read' as const },
  { title: 'Other reports', items: [
    ['/payables/aging', 'Payables aging', 'What is owed to suppliers, by age'],
    ['/payroll/statutory', 'Statutory deductions', 'PAYE, NSSF, SHIF and levy by month'],
    ['/budgets', 'Actual vs budget', 'Open a budget, then its variance report']
  ], permission: 'finance:read' as const }
];

export default function ReportsHubPage() {
  const { can } = useAuth();
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Reports" subtitle="Every report can be printed or exported as a spreadsheet" />
      {GROUPS.filter((g) => can(g.permission) || g.permission === 'giving:read' && can('finance:read')).map((g) => (
        <Card key={g.title} title={g.title}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {g.items.map(([to, label, hint]) => (
              <li key={to}><Link to={to}><strong>{label}</strong></Link> <span className="fin-muted">{hint}</span></li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
