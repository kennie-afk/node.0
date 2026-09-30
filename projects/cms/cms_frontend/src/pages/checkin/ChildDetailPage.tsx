import { useParams } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, InlineConfirm, PageHeader, PageLoader, StatusPill, formatDate, formatDateTime, useKeysetList, useQuery, useToast, type Column } from '../../ui';
import { getChild, removeGuardian, type Guardian, type Session } from '../../api/checkinApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { ageInMonths, ageLabel } from '../../features/ops/lib/rooms';

export default function ChildDetailPage() {
  const id = Number(useParams().id);
  const child = useQuery(() => getChild(id), [id]);
  const history = useKeysetList<Session>('/checkin/sessions', { childId: id }, { limit: 10 });
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('members:write');

  if (child.loading && !child.data) return <PageLoader />;
  if (child.error && !child.data) return <ErrorState message={child.error.message} onRetry={child.refetch} requestId={child.error.requestId} />;
  const c = child.data!;

  const guardianColumns: Array<Column<Guardian>> = [
    { key: 'name', header: 'Guardian' },
    { key: 'relationship', header: 'Relationship', render: (g) => g.relationship ?? '' },
    { key: 'phone', header: 'Phone', render: (g) => <span className="ops-mono">{g.phone ?? ''}</span> },
    { key: 'pickup', header: 'Collection', render: (g) => (g.isAuthorizedPickup ? <Badge tone="ok">Can collect</Badge> : <Badge tone="warn">Drop-off only</Badge>) },
    ...(canWrite
      ? [{
          key: 'actions', header: '', align: 'right' as const,
          render: (g: Guardian) => (
            <span className="ui-actions">
              <Button size="sm" variant="ghost" to={`/checkin/guardians/${g.id}/edit?childId=${id}`}>Edit</Button>
              <InlineConfirm label="Remove" question="Remove this guardian?" onConfirm={async () => { try { await removeGuardian(g.id); toast.success('Guardian removed.'); child.refetch(); } catch (e) { toast.error(normalizeError(e).message); } }} />
            </span>
          )
        }]
      : [])
  ];
  const sessionColumns: Array<Column<Session>> = [
    { key: 'in', header: 'Checked in', render: (s) => formatDateTime(s.checkedInAt) },
    { key: 'room', header: 'Room', render: (s) => s.roomName ?? `Room #${s.roomId}` },
    { key: 'out', header: 'Collected', render: (s) => (s.checkedOutAt ? formatDateTime(s.checkedOutAt) : '') },
    { key: 'status', header: 'Status', render: (s) => <StatusPill status={s.status} /> }
  ];

  return (
    <OpsPage>
      <PageHeader title={`${c.firstName} ${c.lastName}`} crumbs={[{ label: "Children's check-in", to: '/checkin/children' }, { label: `${c.firstName} ${c.lastName}` }]} subtitle={`${ageLabel(c.ageMonths ?? ageInMonths(c.dateOfBirth))} · born ${formatDate(c.dateOfBirth)}${c.isActive ? '' : ' · inactive'}`} actions={canWrite ? <Button to={`/checkin/children/${id}/edit`} variant="secondary">Edit</Button> : undefined} />
      {c.allergies && <div className="ops-alert-allergy" role="alert">ALLERGY: {c.allergies}</div>}
      {c.medicalNotes && <Notice tone="warn" title="Medical">{c.medicalNotes}</Notice>}
      <Card title="Guardians" flush actions={canWrite ? <Button size="sm" variant="secondary" to={`/checkin/children/${id}/guardians/new`}>Add guardian</Button> : undefined}>
        <DataTable columns={guardianColumns} rows={c.guardians ?? []} rowKey={(g) => g.id} empty={<EmptyState title="No guardians" message="Add a guardian so this child can be collected safely." />} />
      </Card>
      <Card title="Recent check-ins" flush>
        <DataTable columns={sessionColumns} rows={history.items} rowKey={(s) => s.id} loading={history.loading} error={history.error} onRetry={history.refresh} empty={<EmptyState title="Never checked in" message="Check-ins appear here." />} />
      </Card>
      <div className="ops-muted">Photos: {c.photoConsent ? 'a parent has agreed' : 'no consent recorded'}.</div>
    </OpsPage>
  );
}
