import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, PageHeader, PageLoader, Select, StatusPill, formatDate, formatDateTime, useQuery, useToast, type Column } from '../../ui';
import { completeTask, getVisitor, moveStage, STAGES, type Stage, type VisitorTask } from '../../api/visitorsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { useMemberNames } from '../../features/ops/components/useMemberNames';
import { STAGE_LABEL } from '../../features/ops/lib/stages';
import { todayISO } from '../../ui';

export default function VisitorDetailPage() {
  const id = Number(useParams().id);
  const visitor = useQuery(() => getVisitor(id), [id]);
  const { can } = useAuth();
  const toast = useToast();
  const [to, setTo] = useState<Stage | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const names = useMemberNames([visitor.data?.assignedMemberId, visitor.data?.convertedMemberId]);

  if (visitor.loading && !visitor.data) return <PageLoader />;
  if (visitor.error && !visitor.data) return <ErrorState message={visitor.error.message} onRetry={visitor.refetch} requestId={visitor.error.requestId} />;
  const v = visitor.data!;
  const open = v.status === 'OPEN';
  const canWrite = can('members:write');

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      visitor.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  const taskColumns: Array<Column<VisitorTask>> = [
    { key: 'title', header: 'Task' },
    { key: 'due', header: 'Due', render: (t) => <>{formatDate(t.dueDate)} {t.status === 'OPEN' && t.dueDate < todayISO() && <Badge tone="bad">Overdue</Badge>}</> },
    { key: 'status', header: 'Status', render: (t) => <StatusPill status={t.status === 'DONE' ? 'COMPLETED' : 'OPEN'} tone={t.status === 'DONE' ? 'ok' : 'warn'} /> },
    ...(canWrite ? [{ key: 'x', header: '', align: 'right' as const, render: (t: VisitorTask) => (t.status === 'OPEN' ? <Button size="sm" variant="secondary" onClick={() => run(() => completeTask(t.id), 'Task completed.')}>Mark done</Button> : null) }] : [])
  ];

  return (
    <OpsPage>
      <PageHeader
        title={`${v.firstName} ${v.lastName}`}
        crumbs={[{ label: 'Visitors', to: '/visitors' }, { label: `${v.firstName} ${v.lastName}` }]}
        subtitle={<>{STAGE_LABEL[v.stage]} · <StatusPill status={v.status} /> · first visit {formatDate(v.firstVisitDate)}</>}
        actions={canWrite && open ? (
          <>
            <Button to={`/visitors/${id}/interactions/new`} variant="secondary">Log a contact</Button>
            <Button to={`/visitors/${id}/tasks/new`} variant="secondary">Add a task</Button>
            <Button to={`/visitors/${id}/edit`} variant="secondary">Edit</Button>
            <Button to={`/visitors/${id}/convert`} variant="primary">Make a member</Button>
          </>
        ) : undefined}
      />
      {v.status === 'CONVERTED' && <Notice tone="ok" title="Now a member">{names(v.convertedMemberId!)} is on the member list; this visitor history was kept.</Notice>}
      <div className="ops-split">
        <div className="ui-stack">
          <Card title="Follow-up tasks" flush>
            <DataTable columns={taskColumns} rows={v.tasks} rowKey={(t) => t.id} empty={<EmptyState title="No tasks" message="Add a task to make sure someone follows up." />} />
          </Card>
          <Card title="Contacts">
            {v.interactions.length === 0 ? <span className="ops-muted">No contact logged yet.</span> : (
              <ul className="ops-list">
                {v.interactions.map((i) => <li key={i.id}><span><Badge>{i.type.toLowerCase()}</Badge> {i.summary}</span><span className="ops-muted">{formatDateTime(i.occurredAt)}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
        <div className="ui-stack">
          <Card title="Details">
            <ul className="ops-list">
              <li><span>Phone</span><span className="ops-mono">{v.phone ?? '-'}</span></li>
              <li><span>Email</span><span>{v.email ?? '-'}</span></li>
              <li><span>Heard of us</span><span>{v.source ?? '-'}</span></li>
              <li><span>Follows up</span><span>{v.assignedMemberId ? names(v.assignedMemberId) : 'Not assigned'}</span></li>
            </ul>
            {v.notes && <div className="ops-note-body" style={{ marginTop: 8 }}>{v.notes}</div>}
          </Card>
          {canWrite && open && (
            <Card title="Move along">
              <form className="ui-stack" onSubmit={(e) => { e.preventDefault(); if (to) void run(() => moveStage(id, to, note.trim() || null), `Moved to ${STAGE_LABEL[to]}.`).then(() => { setTo(''); setNote(''); }); }}>
                <Select aria-label="New stage" value={to} onChange={(e) => setTo(e.target.value as Stage | '')}>
                  <option value="">Choose a stage</option>
                  {STAGES.filter((s) => s !== v.stage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </Select>
                <Input aria-label="Note" placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                <div><Button type="submit" variant="primary" loading={busy} disabled={!to}>Move</Button></div>
              </form>
            </Card>
          )}
          <Card title="History">
            <ul className="ops-list">
              {[...v.history].reverse().map((h) => <li key={h.id}><span>{h.fromStage ? `${STAGE_LABEL[h.fromStage]} → ` : ''}<strong>{STAGE_LABEL[h.toStage]}</strong>{h.note ? <span className="ops-muted"> · {h.note}</span> : null}</span><span className="ops-muted">{formatDate(h.changedAt)}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
