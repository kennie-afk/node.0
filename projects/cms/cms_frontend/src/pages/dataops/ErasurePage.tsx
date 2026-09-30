import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, InlineConfirm, PageHeader, StatusPill, formatDateTime, useQuery, useToast, type Column } from '../../ui';
import { executeErasure, listErasures, type ErasureRequest } from '../../api/dataopsApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { useMemberNames } from '../../features/ops/components/useMemberNames';
import { DataTabs } from './DataTabs';

export default function ErasurePage() {
  const requests = useQuery(listErasures, []);
  const names = useMemberNames((requests.data ?? []).map((r) => r.memberId));
  const toast = useToast();
  const columns: Array<Column<ErasureRequest>> = [
    { key: 'when', header: 'Asked', render: (r) => formatDateTime(r.createdAt) },
    { key: 'who', header: 'Member', render: (r) => names(r.memberId) },
    { key: 'reason', header: 'Reason', render: (r) => r.reason },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} tone={r.status === 'COMPLETED' ? 'ok' : r.status === 'REFUSED' ? 'bad' : 'warn'} /> },
    { key: 'outcome', header: 'Outcome', render: (r) => (r.outcome ? (r.outcome === 'ANONYMISED' ? 'Anonymised (records kept)' : 'Deleted') : r.legalHoldReason ?? '') },
    {
      key: 'x', header: '', align: 'right',
      render: (r) => r.status === 'PENDING' ? (
        <span className="ui-actions">
          <InlineConfirm label="Carry out" question="Erase this member's personal details now? This cannot be undone." confirmLabel="Erase" onConfirm={async () => { try { const done = await executeErasure(r.id); toast.success(done.outcome === 'ANONYMISED' ? 'Anonymised. Their giving records were kept without their identity.' : 'Deleted.'); requests.refetch(); } catch (e) { toast.error(normalizeError(e).message); } }} />
          <Button size="sm" variant="ghost" to={`/data/erasure/${r.id}/refuse`}>Refuse</Button>
        </span>
      ) : null
    }
  ];
  return (
    <OpsPage>
      <PageHeader title="Erasure requests" subtitle="A member's right to have their personal data removed." actions={<Button to="/data/erasure/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New request</Button>} />
      <DataTabs active="erasure" />
      <Notice tone="info" title="What erasure does">A member with no giving or ledger records is deleted. A member who has giving records is <strong>anonymised</strong> instead: name, contact details and notes are removed, but the financial records stay, because the church must keep its accounts. If a legal reason prevents erasure, refuse the request and record why.</Notice>
      <DataTable columns={columns} rows={requests.data ?? []} rowKey={(r) => r.id} loading={requests.loading} error={requests.error} onRetry={requests.refetch} empty={<EmptyState title="No erasure requests" message="Record a request when a member asks to be forgotten." action={<Button to="/data/erasure/new" variant="primary">New request</Button>} />} />
    </OpsPage>
  );
}
