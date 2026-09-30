import { useState } from 'react';
import { Button, Card, DataTable, EmptyState, PageHeader, StatusPill, formatDateTime, useQuery, type Column } from '../../ui';
import { listImports, type ImportJob } from '../../api/dataopsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { errorsByRow, summarise } from '../../features/ops/lib/importing';
import { DataTabs } from './DataTabs';

export default function ImportHistoryPage() {
  const jobs = useQuery(listImports, []);
  const [open, setOpen] = useState<number | null>(null);
  const columns: Array<Column<ImportJob>> = [
    { key: 'when', header: 'When', render: (j) => (j.createdAt ? formatDateTime(j.createdAt) : '') },
    { key: 'status', header: 'Status', render: (j) => <StatusPill status={j.status} tone={j.status === 'APPLIED' ? 'ok' : 'neutral'} /> },
    { key: 'what', header: 'Result', render: (j) => summarise(j) },
    { key: 'x', header: '', align: 'right', render: (j) => (j.errorCount > 0 ? <Button size="sm" variant="ghost" onClick={() => setOpen(open === j.id ? null : j.id!)}>{open === j.id ? 'Hide problems' : 'See problems'}</Button> : null) }
  ];
  const selected = jobs.data?.find((j) => j.id === open);
  return (
    <OpsPage>
      <PageHeader title="Import history" actions={<Button to="/data/import" variant="primary">New import</Button>} />
      <DataTabs active="import" />
      <DataTable columns={columns} rows={jobs.data ?? []} rowKey={(j) => j.id ?? 0} loading={jobs.loading} error={jobs.error} onRetry={jobs.refetch} empty={<EmptyState title="No imports yet" message="Imports you run show up here with their results." action={<Button to="/data/import" variant="primary">Import members</Button>} />} />
      {selected && <Card title="Problems in this import"><ul className="ops-list">{errorsByRow(selected.errors).map((r) => <li key={r.row}><span>Line {r.row}</span><span className="ops-muted">{r.problems.join('; ')}</span></li>)}</ul></Card>}
    </OpsPage>
  );
}
