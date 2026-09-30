import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, DataTable, DateInput, EmptyState, Field, FilterBar, LoadMore, PageHeader, Select, StatusPill, formatDateTime, monthStartISO, todayISO, useKeysetList, useToast, type Column } from '../../ui';
import type { Session } from '../../api/checkinApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { downloadAuthed } from '../../features/ops/lib/download';
import { localToISO } from '../../features/ops/lib/dates';
import { CheckinTabs } from './CheckinTabs';

const columns: Array<Column<Session>> = [
  { key: 'child', header: 'Child', render: (s) => `${s.firstName ?? ''} ${s.lastName ?? ''}` },
  { key: 'room', header: 'Room', render: (s) => s.roomName ?? '' },
  { key: 'tag', header: 'Tag', render: (s) => <span className="ops-mono">{s.securityTag}</span> },
  { key: 'in', header: 'In', render: (s) => formatDateTime(s.checkedInAt) },
  { key: 'out', header: 'Out', render: (s) => (s.checkedOutAt ? formatDateTime(s.checkedOutAt) : '') },
  { key: 'status', header: 'Status', render: (s) => <StatusPill status={s.status} /> },
  { key: 'note', header: 'Note', render: (s) => (s.overrideReason ? `Override: ${s.overrideReason}` : '') }
];

export default function SessionsPage() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<'' | 'IN' | 'OUT'>('');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = useKeysetList<Session>('/checkin/sessions', { from: from ? localToISO(from, '00:00') : undefined, to: to ? localToISO(to, '23:59') : undefined, status: status || undefined });
  return (
    <OpsPage>
      <PageHeader title="Children's check-in" subtitle="Every check-in and check-out, newest first." actions={<Button variant="secondary" loading={busy} icon={<Download size={12} aria-hidden />} disabled={!from || !to} onClick={async () => { setBusy(true); try { await downloadAuthed('/checkin/export/attendance.csv', 'checkin-attendance.csv', { from: localToISO(from, '00:00'), to: localToISO(to, '23:59') }); } catch (e) { toast.error(normalizeError(e).message); } finally { setBusy(false); } }}>Export CSV</Button>} />
      <CheckinTabs active="history" />
      <FilterBar>
        <Field label="From">{(c) => <DateInput {...c} value={from} onChange={setFrom} />}</Field>
        <Field label="To">{(c) => <DateInput {...c} value={to} onChange={setTo} />}</Field>
        <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value as '' | 'IN' | 'OUT')}><option value="">All</option><option value="IN">Still in</option><option value="OUT">Collected</option></Select>}</Field>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(s) => s.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title="No check-ins in this period" message="Widen the dates or clear the status filter." />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="check-ins" /> : undefined} />
    </OpsPage>
  );
}
