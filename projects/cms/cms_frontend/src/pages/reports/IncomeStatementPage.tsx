import { useState } from 'react';
import { Card, DataTable, Field, Select, StackedBar, useQuery, formatMoney, toMinor } from '../../ui';
import { getIncomeStatement, type StatementLine } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function IncomeStatementPage() {
  const range = useRangeParams();
  const [compare, setCompare] = useState('none');
  const [byFund, setByFund] = useState(false);
  const { data, error, loading, refetch } = useQuery(() => getIncomeStatement({ from: range.from, to: range.to, fundId: range.fundId || undefined, compare, byFund }), [range.from, range.to, range.fundId, compare, byFund]);
  const comparing = compare !== 'none';
  const cols = (kind: 'income' | 'expenses') => [
    { key: 'name', header: kind === 'income' ? 'Income' : 'Spending', render: (l: StatementLine) => `${l.code} · ${l.name}` },
    { key: 'amount', header: 'This period', numeric: true, render: (l: StatementLine) => <Money value={l.amount} /> },
    ...(comparing ? [{ key: 'prior', header: 'Comparison', numeric: true, render: (l: StatementLine) => <Money value={l.priorAmount ?? '0.00'} muted /> }, { key: 'chg', header: 'Change', numeric: true, render: (l: StatementLine) => <Money value={l.change ?? '0.00'} /> }] : [])
  ];
  return (
    <ReportFrame
      title="Income statement"
      subtitle={data ? `${data.from} to ${data.to}` : undefined}
      loading={loading}
      error={error}
      onRetry={refetch}
      csv={{ path: '/reports/income-statement', query: { from: range.from, to: range.to, fundId: range.fundId || undefined, compare: comparing ? compare : undefined }, name: 'income-statement.csv' }}
      filters={
        <div className="ui-stack">
          <RangeFilters range={range} />
          <div className="ui-row">
            <Field label="Compare with">{(c) => <Select {...c} value={compare} onChange={(e) => setCompare(e.target.value)}><option value="none">Nothing</option><option value="prior-period">The period just before</option><option value="prior-year">The same dates last year</option></Select>}</Field>
            <label className="ui-row"><input type="checkbox" checked={byFund} onChange={(e) => setByFund(e.target.checked)} /> Break down by fund</label>
          </div>
        </div>
      }
    >
      {data && (
        <>
          <Card title="Income" flush><DataTable rowKey={(l) => l.code} rows={data.income} columns={cols('income')} totals={<tr><td>Total income</td><td className="ui-num"><Money value={data.totalIncome} strong /></td>{comparing && <><td className="ui-num"><Money value={data.prior?.totalIncome ?? '0.00'} muted /></td><td /></>}</tr>} empty={<span>No income in this period.</span>} /></Card>
          <Card title="Spending" flush><DataTable rowKey={(l) => l.code} rows={data.expenses} columns={cols('expenses')} totals={<tr><td>Total spending</td><td className="ui-num"><Money value={data.totalExpenses} strong /></td>{comparing && <><td className="ui-num"><Money value={data.prior?.totalExpenses ?? '0.00'} muted /></td><td /></>}</tr>} empty={<span>No spending in this period.</span>} /></Card>
          <Card>
            <p><strong>{data.surplus.startsWith('-') ? 'Deficit' : 'Surplus'}:</strong> <Money value={data.surplus} currency strong />{comparing && data.prior && <span className="fin-muted"> (comparison <Money value={data.prior.surplus} />)</span>}</p>
            <StackedBar label="Income against spending" format={(n) => formatMoney(n.toFixed(2))} rows={[{ label: 'Period', segments: [{ name: 'Income', value: toMinor(data.totalIncome) / 100 }, { name: 'Spending', value: toMinor(data.totalExpenses) / 100 }] }]} />
          </Card>
          {data.byFund && data.byFund.length > 0 && (
            <Card title="By fund" flush>
              <DataTable rowKey={(f) => f.fundId} rows={data.byFund} columns={[{ key: 'f', header: 'Fund', render: (f) => `${f.code} · ${f.name}` }, { key: 'i', header: 'Income', numeric: true, render: (f) => <Money value={f.totalIncome} /> }, { key: 'e', header: 'Spending', numeric: true, render: (f) => <Money value={f.totalExpenses} /> }, { key: 's', header: 'Surplus', numeric: true, render: (f) => <Money value={f.surplus} strong /> }]} />
            </Card>
          )}
        </>
      )}
    </ReportFrame>
  );
}
