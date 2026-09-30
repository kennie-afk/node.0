import { useState } from 'react';
import { Button, DataTable, EmptyState, FilterBar, PageHeader, Select, StatusPill, formatDateTime, useQuery, useToast, type Column } from '../../ui';
import { approveSwap, cancelSwap, listSwaps, rejectSwap, type Swap } from '../../api/volunteersApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { useMemberNames } from '../../features/ops/components/useMemberNames';
import { VolunteersTabs } from './VolunteersTabs';

export default function SwapsPage() {
  const [status, setStatus] = useState('PENDING');
  const swaps = useQuery(() => listSwaps(status || undefined), [status]);
  const names = useMemberNames((swaps.data ?? []).flatMap((s) => [s.fromMemberId, s.toMemberId]));
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (id: number, work: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await work();
      toast.success(done);
      swaps.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(null);
    }
  };

  const columns: Array<Column<Swap>> = [
    { key: 'from', header: 'Asked by', render: (s) => names(s.fromMemberId) },
    { key: 'to', header: 'Handing to', render: (s) => (s.toMemberId ? names(s.toMemberId) : <span className="ops-muted">Anyone</span>) },
    { key: 'assignment', header: 'Assignment', numeric: true, render: (s) => `#${s.assignmentId}` },
    { key: 'reason', header: 'Reason', render: (s) => s.reason ?? '' },
    { key: 'status', header: 'Status', render: (s) => <StatusPill status={s.status} /> },
    { key: 'asked', header: 'Asked', render: (s) => formatDateTime(s.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) =>
        s.status === 'PENDING' ? (
          <span className="ui-actions">
            {can('members:write') && <Button size="sm" variant="primary" loading={busy === s.id} onClick={() => act(s.id, () => approveSwap(s.id), 'Swap approved. The roster has been updated.')}>Approve</Button>}
            {can('members:write') && <Button size="sm" variant="secondary" loading={busy === s.id} onClick={() => act(s.id, () => rejectSwap(s.id), 'Swap declined.')}>Decline</Button>}
            <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => act(s.id, () => cancelSwap(s.id), 'Request withdrawn.')}>Withdraw</Button>
          </span>
        ) : null
    }
  ];
  return (
    <OpsPage>
      <PageHeader title="Volunteers" subtitle="Volunteers who cannot make their slot ask for a swap; a coordinator approves it." />
      <VolunteersTabs active="swaps" />
      <FilterBar>
        <div className="ui-field">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Waiting for a decision</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Declined</option>
            <option value="CANCELLED">Withdrawn</option>
            <option value="">Everything</option>
          </Select>
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={swaps.data ?? []} rowKey={(s) => s.id} loading={swaps.loading} error={swaps.error} onRetry={swaps.refetch} empty={<EmptyState title="No swap requests" message="When a volunteer asks to swap, it shows up here for approval." />} />
    </OpsPage>
  );
}
