import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, InlineConfirm, PageHeader, StatusPill, useQuery, useToast, type Column } from '../../ui';
import { deleteTemplate, listTemplates, type MessageTemplate } from '../../api/commsApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { CommsTabs } from './CommsTabs';

export default function TemplatesPage() {
  const templates = useQuery(listTemplates, []);
  const toast = useToast();
  const columns: Array<Column<MessageTemplate>> = [
    { key: 'name', header: 'Template' },
    { key: 'channel', header: 'Channel', render: (t) => t.channel },
    { key: 'body', header: 'Message', render: (t) => <span className="ops-muted">{t.body.length > 70 ? `${t.body.slice(0, 70)}…` : t.body}</span> },
    { key: 'active', header: 'Status', render: (t) => <StatusPill status={t.isActive ? 'ACTIVE' : 'CLOSED'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <span className="ui-actions">
          <Button size="sm" variant="ghost" to={`/comms/templates/${t.id}/edit`}>Edit</Button>
          <InlineConfirm label="Delete" question="Delete this template?" onConfirm={async () => {
            try {
              await deleteTemplate(t.id);
              toast.success('Template deleted.');
              templates.refetch();
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
      <PageHeader title="Communications" actions={<Button to="/comms/templates/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New template</Button>} />
      <CommsTabs active="templates" />
      <DataTable columns={columns} rows={templates.data ?? []} rowKey={(t) => t.id} loading={templates.loading} error={templates.error} onRetry={templates.refetch} empty={<EmptyState title="No templates" message="Save the messages you send often, like a welcome text or a service reminder." action={<Button to="/comms/templates/new" variant="primary">New template</Button>} />} />
    </OpsPage>
  );
}
