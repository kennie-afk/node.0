import { Card, DataTable, Donut, formatMoney, toMinor, useQuery } from '../../ui';
import { getExpensesByMinistry } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function MinistryExpensesPage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getExpensesByMinistry({ from: range.from, to: range.to, fundId: range.fundId || undefined }), [range.from, range.to, range.fundId]);
  return (
    <ReportFrame title="Spending by ministry" subtitle={data ? `${data.from} to ${data.to} · total ${data.total}` : undefined} loading={loading} error={error} onRetry={refetch} csv={{ path: '/reports/expenses/by-ministry', query: { from: range.from, to: range.to, fundId: range.fundId || undefined }, name: 'spending-by-ministry.csv' }} filters={<RangeFilters range={range} />}>
      {data && (
        <>
          {data.ministries.length > 1 && <Card><Donut label="Spending share by ministry" slices={data.ministries.map((m) => ({ label: m.name, value: toMinor(m.total) / 100 }))} format={(n) => formatMoney(n.toFixed(2))} /></Card>}
          <Card flush>
            <DataTable rowKey={(m) => String(m.ministryId)} rows={data.ministries} columns={[
              { key: 'n', header: 'Ministry', render: (m) => <div>{m.name}<div className="fin-muted">{m.accounts.map((a) => `${a.name} ${a.amount}`).join(' · ')}</div></div> },
              { key: 's', header: 'Share', numeric: true, render: (m) => `${m.share}%` },
              { key: 't', header: 'Spent', numeric: true, render: (m) => <Money value={m.total} strong /> }
            ]} empty={<span>No spending in this period.</span>} />
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
