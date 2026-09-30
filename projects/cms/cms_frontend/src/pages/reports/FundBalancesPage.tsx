import { Card, DataTable, Donut, formatMoney, toMinor, useQuery } from '../../ui';
import { getFundBalances } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function FundBalancesPage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getFundBalances({ asOf: range.asOf }), [range.asOf]);
  const positive = (data?.funds ?? []).filter((f) => toMinor(f.netAssets) > 0);
  return (
    <ReportFrame title="Fund balances" subtitle={data ? `As of ${data.asOf}` : undefined} loading={loading} error={error} onRetry={refetch} csv={{ path: '/reports/fund-balances', query: { asOf: range.asOf }, name: 'fund-balances.csv' }} filters={<RangeFilters range={range} mode="asOf" fund={false} />}>
      {data && (
        <>
          <Card flush>
            <DataTable rowKey={(f) => f.fundId} rows={data.funds} columns={[
              { key: 'f', header: 'Fund', render: (f) => `${f.code} · ${f.name}` },
              { key: 'r', header: 'Restriction', render: (f) => f.restriction.replace(/_/g, ' ').toLowerCase() },
              { key: 'c', header: 'Cash', numeric: true, render: (f) => <Money value={f.cash} /> },
              { key: 'a', header: 'Total assets', numeric: true, render: (f) => <Money value={f.totalAssets} /> },
              { key: 'l', header: 'Liabilities', numeric: true, render: (f) => <Money value={f.liabilities} /> },
              { key: 'n', header: 'Net assets', numeric: true, render: (f) => <Money value={f.netAssets} strong /> }
            ]} />
          </Card>
          {positive.length > 1 && <Card title="Net assets by fund"><Donut label="Net assets by fund" slices={positive.map((f) => ({ label: f.name, value: toMinor(f.netAssets) / 100 }))} format={(n) => formatMoney(n.toFixed(2))} /></Card>}
        </>
      )}
    </ReportFrame>
  );
}
