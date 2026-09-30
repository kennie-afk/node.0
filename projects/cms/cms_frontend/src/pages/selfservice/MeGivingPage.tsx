import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button, DataTable, EmptyState, ErrorState, LoadMore, PageHeader, Select, StatTile, StatusPill, formatDate, formatMoney, useKeysetList, useQuery, type Column } from '../../ui';
import { myGiving, type MyGift } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { MeTabs } from './MeTabs';
import { isNotLinked } from '../../features/ops/lib/notLinked';
import { NotLinked } from './NotLinked';

const columns: Array<Column<MyGift>> = [
  { key: 'date', header: 'Date', render: (g) => formatDate(g.date) },
  { key: 'type', header: 'Gift', render: (g) => g.contributionType },
  { key: 'receipt', header: 'Receipt', render: (g) => <span className="ops-mono">{g.receiptNo ?? ''}</span> },
  { key: 'status', header: '', render: (g) => (g.status && g.status !== 'POSTED' ? <StatusPill status={g.status} /> : null) },
  { key: 'amount', header: 'Amount', numeric: true, render: (g) => formatMoney(g.amount) }
];

export default function MeGivingPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const list = useKeysetList<MyGift>('/me/giving', { year }, { limit: 100 });
  const summary = useQuery(() => myGiving({ year, limit: 1 }), [year]);
  if (isNotLinked(list.error)) return <OpsPage><PageHeader title="My giving" /><MeTabs active="giving" /><NotLinked /></OpsPage>;
  if (list.error && list.items.length === 0 && !list.loading) return <ErrorState message={list.error.message} onRetry={list.refresh} requestId={list.error.requestId} />;
  return (
    <OpsPage>
      <PageHeader title="My giving" subtitle="Your own gifts and receipts. Only you and the church's finance team can see them." actions={<><Select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2, 3].map((i) => <option key={i} value={thisYear - i}>{thisYear - i}</option>)}</Select><Button variant="secondary" icon={<Printer size={12} aria-hidden />} onClick={() => window.print()}>Print statement</Button></>} />
      <MeTabs active="giving" />
      <div className="ops-printable ui-stack">
        <h2 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>Giving statement {year}</h2>
        <StatTile label={`Total given in ${year}`} value={summary.data ? formatMoney(summary.data.totalForYear) : '-'} foot="Voided gifts are not counted" />
        <DataTable columns={columns} rows={list.items} rowKey={(g) => g.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title={`No gifts recorded in ${year}`} message="When you give, your receipts appear here." />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="gifts" /> : undefined} />
      </div>
      <div className="ops-noprint"><Notice tone="info">This is a summary for your records. For a formal receipt for a particular gift, ask the church office and quote the receipt number.</Notice></div>
    </OpsPage>
  );
}
