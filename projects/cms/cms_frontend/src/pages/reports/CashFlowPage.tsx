import { Card, DataTable, StatusPill, useQuery } from '../../ui';
import { getCashFlow } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function CashFlowPage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getCashFlow({ from: range.from, to: range.to, fundId: range.fundId || undefined }), [range.from, range.to, range.fundId]);
  return (
    <ReportFrame title="Cash flow" subtitle={data ? `${data.from} to ${data.to}` : undefined} loading={loading} error={error} onRetry={refetch} csv={{ path: '/reports/cash-flow', query: { from: range.from, to: range.to, fundId: range.fundId || undefined }, name: 'cash-flow.csv' }} filters={<RangeFilters range={range} />}>
      {data && (
        <>
          <Card><p>Cash at the start <Money value={data.openingCash} strong currency /> · net change <Money value={data.netChange} strong /> · cash at the end <Money value={data.closingCash} strong currency /> <StatusPill status={data.reconciles ? 'Ties to the accounts' : 'Does not tie'} tone={data.reconciles ? 'ok' : 'bad'} /></p></Card>
          <Card title="Cash in" flush><DataTable rowKey={(r) => r.sourceType} rows={data.inflows} columns={[{ key: 'l', header: 'Source', render: (r) => r.label }, { key: 'a', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} empty={<span>No cash came in.</span>} /></Card>
          <Card title="Cash out" flush><DataTable rowKey={(r) => r.sourceType} rows={data.outflows} columns={[{ key: 'l', header: 'Purpose', render: (r) => r.label }, { key: 'a', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} empty={<span>No cash went out.</span>} /></Card>
          <Card title="By account" flush><DataTable rowKey={(a) => a.accountId} rows={data.accounts} columns={[{ key: 'n', header: 'Account', render: (a) => `${a.code} · ${a.name}` }, { key: 'o', header: 'Opening', numeric: true, render: (a) => <Money value={a.opening} /> }, { key: 'c', header: 'Change', numeric: true, render: (a) => <Money value={a.change} /> }, { key: 'cl', header: 'Closing', numeric: true, render: (a) => <Money value={a.closing} strong /> }]} /></Card>
        </>
      )}
    </ReportFrame>
  );
}
