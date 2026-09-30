import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataTable, DateInput, Field, FilterBar, PageHeader, StackedBar, toMinor, useQuery, formatMoney, formatDate } from '../../ui';
import { getAging, type AgingBucketRow } from '../../api/payablesApi';
import { Money, PrintButton } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { todayISO } from '../../ui';

export default function AgingPage() {
  const [asOf, setAsOf] = useState(todayISO());
  const { data, error, loading, refetch } = useQuery(() => getAging(asOf), [asOf]);
  const m = (v: string) => toMinor(v) / 100;
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Payables aging" subtitle="What is owed, and for how long" actions={<PrintButton />} />
      <SectionTabs section="payables" active="/payables/aging" />
      <FilterBar><Field label="As of">{(c) => <DateInput {...c} value={asOf} onChange={setAsOf} />}</Field></FilterBar>
      {data && data.vendors.length > 0 && (
        <Card title="Where the debt is">
          <StackedBar
            label="Amounts owed by age bucket"
            format={(n) => formatMoney(n.toFixed(2))}
            rows={[{ label: 'All vendors', segments: [
              { name: 'Not yet due', value: m(data.totals.current) }, { name: '1-30 days', value: m(data.totals.days1to30) }, { name: '31-60 days', value: m(data.totals.days31to60) },
              { name: '61-90 days', value: m(data.totals.days61to90) }, { name: 'Over 90 days', value: m(data.totals.over90) }] }]}
          />
        </Card>
      )}
      <Card flush>
        <DataTable<AgingBucketRow>
          rowKey={(r) => r.vendorId}
          rows={data?.vendors ?? []}
          loading={loading}
          error={error}
          onRetry={refetch}
          columns={[
            { key: 'vendor', header: 'Vendor', render: (r) => <Fragment>{r.vendor}<div className="fin-muted">{r.bills.map((b) => <span key={b.billId} style={{ marginRight: 8 }}><Link to={`/payables/bills/${b.billId}`}>#{b.billNo}</Link> due {formatDate(b.dueDate)}</span>)}</div></Fragment> },
            { key: 'cur', header: 'Not due', numeric: true, render: (r) => <Money value={r.current} muted={r.current === '0.00'} /> },
            { key: 'a', header: '1-30', numeric: true, render: (r) => <Money value={r.days1to30} muted={r.days1to30 === '0.00'} /> },
            { key: 'b', header: '31-60', numeric: true, render: (r) => <Money value={r.days31to60} muted={r.days31to60 === '0.00'} /> },
            { key: 'c', header: '61-90', numeric: true, render: (r) => <Money value={r.days61to90} muted={r.days61to90 === '0.00'} /> },
            { key: 'd', header: '90+', numeric: true, render: (r) => <Money value={r.over90} muted={r.over90 === '0.00'} /> },
            { key: 'tot', header: 'Total', numeric: true, render: (r) => <Money value={r.total} strong /> }
          ]}
          totals={data && <tr><td>Total</td><td className="ui-num"><Money value={data.totals.current} strong /></td><td className="ui-num"><Money value={data.totals.days1to30} strong /></td><td className="ui-num"><Money value={data.totals.days31to60} strong /></td><td className="ui-num"><Money value={data.totals.days61to90} strong /></td><td className="ui-num"><Money value={data.totals.over90} strong /></td><td className="ui-num"><Money value={data.totals.total} strong /></td></tr>}
          empty={<span>Nothing is owed as of this date.</span>}
        />
      </Card>
    </div>
  );
}
