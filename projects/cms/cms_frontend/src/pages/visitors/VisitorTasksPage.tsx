import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, DataTable, EmptyState, FilterBar, PageHeader, Select, formatDate, useQuery, useToast, type Column } from '../../ui';
import { completeTask, dueTasks, type VisitorTask } from '../../api/visitorsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { VisitorsTabs } from './VisitorsTabs';

export default function VisitorTasksPage() {
  const [within, setWithin] = useState(0);
  const tasks = useQuery(() => dueTasks({ within }), [within]);
  const { can } = useAuth();
  const toast = useToast();
  const columns: Array<Column<VisitorTask>> = [
    { key: 'title', header: 'Task' },
    { key: 'who', header: 'Visitor', render: (t) => <Link to={`/visitors/${t.visitorId}`}>{t.firstName} {t.lastName}</Link> },
    { key: 'phone', header: 'Phone', render: (t) => <span className="ops-mono">{t.phone ?? ''}</span> },
    { key: 'due', header: 'Due', render: (t) => <>{formatDate(t.dueDate)} {t.overdue && <Badge tone="bad">Overdue</Badge>}</> },
    ...(can('members:write') ? [{ key: 'x', header: '', align: 'right' as const, render: (t: VisitorTask) => <Button size="sm" variant="secondary" onClick={async () => { try { await completeTask(t.id); toast.success('Task completed.'); tasks.refetch(); } catch (e) { toast.error(normalizeError(e).message); } }}>Mark done</Button> }] : [])
  ];
  return (
    <OpsPage>
      <PageHeader title="Visitors" subtitle="Follow-ups that are overdue, or coming due soon." />
      <VisitorsTabs active="tasks" />
      <FilterBar>
        <div className="ui-field"><Select aria-label="Window" value={within} onChange={(e) => setWithin(Number(e.target.value))}><option value={0}>Overdue only</option><option value={3}>Overdue and next 3 days</option><option value={7}>Overdue and next 7 days</option><option value={30}>Overdue and next 30 days</option></Select></div>
      </FilterBar>
      <DataTable columns={columns} rows={tasks.data ?? []} rowKey={(t) => t.id} loading={tasks.loading} error={tasks.error} onRetry={tasks.refetch} empty={<EmptyState title="Nothing overdue" message="Every follow-up is on time. Try a longer window to see what is coming." />} />
    </OpsPage>
  );
}
