import { Card, DataTable, StatusPill, useQuery } from '../../ui';
import { getBalanceSheet, type StatementLine } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function BalanceSheetPage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getBalanceSheet({ asOf: range.asOf, fundId: range.fundId || undefined }), [range.asOf, range.fundId]);
  const table = (title: string, rows: StatementLine[], total: string) => (
    <Card title={title} flush>
      <DataTable rowKey={(l) => l.code + l.name} rows={rows} columns={[{ key: 'n', header: 'Account', render: (l) => (l.code ? `${l.code} · ${l.name}` : l.name) }, { key: 'a', header: 'Amount', numeric: true, render: (l) => <Money value={l.amount} /> }]} totals={<tr><td>Total {title.toLowerCase()}</td><td className="ui-num"><Money value={total} strong /></td></tr>} empty={<span>None.</span>} />
    </Card>
  );
  return (
    <ReportFrame title="Balance sheet" subtitle={data ? `As of ${data.asOf}` : undefined} loading={loading} error={error} onRetry={refetch} csv={{ path: '/reports/balance-sheet', query: { asOf: range.asOf, fundId: range.fundId || undefined }, name: 'balance-sheet.csv' }} filters={<RangeFilters range={range} mode="asOf" />}>
      {data && (
        <>
          {table('Assets', data.assets, data.totalAssets)}
          {table('Liabilities', data.liabilities, data.totalLiabilities)}
          {table('Net assets', data.netAssets, data.totalNetAssets)}
          <Card>
            <p>
              Assets <Money value={data.totalAssets} strong /> = liabilities <Money value={data.totalLiabilities} strong /> + net assets <Money value={data.totalNetAssets} strong />{' '}
              <StatusPill status={data.balanced ? 'Balanced' : `Out by ${data.difference}`} tone={data.balanced ? 'ok' : 'bad'} />
            </p>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
