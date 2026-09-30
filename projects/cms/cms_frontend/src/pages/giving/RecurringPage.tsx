import { useState } from 'react';
import { Button, DataTable, EmptyState, Field, FilterBar, formatDate, PageHeader, Select, StatusPill, useQuery, useToast } from '../../ui';
import { listRecurring, runRecurring, updateRecurring, type Recurring } from '../../api/givingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { useGivingTypes } from '../../features/finance/components/lookups';

export default function RecurringPage() {
  const { can } = useAuth();
  const toast = useToast();
  const types = useGivingTypes();
  const [status, setStatus] = useState('ACTIVE');
  const { data, error, loading, refetch } = useQuery(() => listRecurring({ status: status || undefined }), [status]);
  const [busy, setBusy] = useState(false);

  const change = async (r: Recurring, next: string) => {
    try { await updateRecurring(r.id, { status: next }); toast.success(`Schedule ${next.toLowerCase()}`); refetch(); } catch (f) { toast.error(normalizeError(f).message); }
  };
  const run = async () => {
    setBusy(true);
    try { await runRecurring(); toast.success('Due recurring gifts were generated'); refetch(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Recurring gifts"
        subtitle="Standing schedules that post a gift each period"
        actions={can('giving:write') && <div className="ui-row"><Button size="sm" loading={busy} onClick={run}>Generate gifts due today</Button><Button to="/giving/recurring/new" variant="primary" size="sm">New schedule</Button></div>}
      />
      <SectionTabs section="giving" active="/giving/recurring" />
      <FilterBar><Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ENDED">Ended</option></Select>}</Field></FilterBar>
      <DataTable<Recurring>
        rowKey={(r) => r.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        columns={[
          { key: 'who', header: 'Member', render: (r) => r.memberName ?? `#${r.memberId}` },
          { key: 'type', header: 'Type', render: (r) => types.data?.find((t) => t.id === r.givingTypeId)?.name ?? '-' },
          { key: 'amount', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> },
          { key: 'freq', header: 'Every', render: (r) => r.frequency.toLowerCase() },
          { key: 'next', header: 'Next due', render: (r) => (r.nextDueDate ? formatDate(r.nextDueDate) : '-') },
          { key: 'last', header: 'Last gift', render: (r) => (r.lastGeneratedDate ? formatDate(r.lastGeneratedDate) : '-') },
          { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          {
            key: 'act', header: '',
            render: (r) => can('giving:write') && r.status !== 'ENDED' && (
              <span className="ui-row">
                {r.status === 'ACTIVE' ? <Button size="sm" variant="ghost" onClick={() => change(r, 'PAUSED')}>Pause</Button> : <Button size="sm" variant="ghost" onClick={() => change(r, 'ACTIVE')}>Resume</Button>}
                <Button size="sm" variant="ghost" onClick={() => change(r, 'ENDED')}>End</Button>
              </span>
            )
          }
        ]}
        empty={<EmptyState title="No recurring gifts" message="Add a schedule for members who give the same amount every month." />}
      />
    </div>
  );
}
