import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, InlineConfirm, PageHeader, useQuery, useToast, type Column } from '../../ui';
import { deleteSegment, listSegments, type Segment } from '../../api/commsApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { describeSegment } from '../../features/ops/lib/segments';
import { CommsTabs } from './CommsTabs';

export default function SegmentsPage() {
  const segments = useQuery(listSegments, []);
  const toast = useToast();
  const columns: Array<Column<Segment>> = [
    { key: 'name', header: 'Audience' },
    { key: 'who', header: 'Who', render: (s) => describeSegment(s.definition) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <span className="ui-actions">
          <Button size="sm" variant="ghost" to={`/comms/segments/${s.id}/edit`}>Edit and preview</Button>
          <InlineConfirm label="Delete" question="Delete this audience?" onConfirm={async () => {
            try {
              await deleteSegment(s.id);
              toast.success('Audience deleted.');
              segments.refetch();
            } catch (failure) {
              toast.error(normalizeError(failure).message);
            }
          }} />
        </span>
      )
    }
  ];
  return (
    <OpsPage>
      <PageHeader title="Communications" actions={<Button to="/comms/segments/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New audience</Button>} />
      <CommsTabs active="segments" />
      <DataTable columns={columns} rows={segments.data ?? []} rowKey={(s) => s.id} loading={segments.loading} error={segments.error} onRetry={segments.refetch} empty={<EmptyState title="No audiences" message="An audience is a saved group of people, like everyone or a ministry's members." action={<Button to="/comms/segments/new" variant="primary">New audience</Button>} />} />
    </OpsPage>
  );
}
