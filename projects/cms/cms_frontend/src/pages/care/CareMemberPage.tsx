import { Link, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LoadMore, PageHeader, PageLoader, formatDate, useKeysetList, useQuery, useToast } from '../../ui';
import { completeVisitationFollowUp, type CareNote, type Visitation } from '../../api/careApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { memberName } from '../../features/ops/lookups';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { ConfidentialityNotice } from './ConfidentialityNotice';

export default function CareMemberPage() {
  const memberId = Number(useParams().memberId);
  const name = useQuery(() => memberName(memberId), [memberId]);
  const notes = useKeysetList<CareNote>('/care/notes', { memberId }, { limit: 20 });
  const visits = useKeysetList<Visitation>('/care/visitations', { memberId }, { limit: 20 });
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can('care:write');
  if (name.loading && !name.data) return <PageLoader />;
  if (name.error && !name.data) return <ErrorState message={name.error.message} onRetry={name.refetch} requestId={name.error.requestId} />;
  return (
    <OpsPage>
      <PageHeader title={name.data ?? `Member #${memberId}`} crumbs={[{ label: 'Pastoral care', to: '/care' }, { label: name.data ?? 'Member' }]} actions={canWrite ? <><Button to={`/care/notes/new?memberId=${memberId}`} variant="primary">New note</Button><Button to={`/care/visitations/new?memberId=${memberId}`} variant="secondary">Log a visit</Button></> : undefined} />
      <ConfidentialityNotice mode="read" />
      <div className="ops-split">
        <Card title="Notes">
          {notes.error && <span className="ops-muted">{notes.error.message}</span>}
          {!notes.loading && notes.items.length === 0 && !notes.error && <EmptyState title="No notes" message="Care notes for this person appear here." action={canWrite ? <Button to={`/care/notes/new?memberId=${memberId}`} variant="primary">New note</Button> : undefined} />}
          <ul className="ops-list">
            {notes.items.map((n) => (
              <li key={n.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-row"><Link to={`/care/notes/${n.id}`}><strong>{n.kind.charAt(0) + n.kind.slice(1).toLowerCase()}</strong></Link> <span className="ops-muted">{formatDate(n.occurredOn)}</span> {n.isConfidential && <Badge tone="warn">Confidential</Badge>}</div>
                  {n.redacted ? <div className="ops-redacted"><Lock size={11} aria-hidden /> Confidential note by another user. The text is hidden from you.</div> : <div className="ops-note-body">{n.body && n.body.length > 240 ? `${n.body.slice(0, 240)}…` : n.body}</div>}
                </div>
                {n.followUpOn && !n.followUpDone && <Badge tone="info">Follow up {formatDate(n.followUpOn)}</Badge>}
              </li>
            ))}
          </ul>
          {notes.items.length > 0 && <LoadMore shown={notes.items.length} hasMore={notes.hasMore} loading={notes.loadingMore} onMore={notes.loadMore} noun="notes" />}
        </Card>
        <Card title="Visits">
          {!visits.loading && visits.items.length === 0 && <EmptyState title="No visits logged" message="Home, hospital and prison visits appear here." />}
          <ul className="ops-list">
            {visits.items.map((v) => (
              <li key={v.id} style={{ alignItems: 'flex-start' }}>
                <div><strong>{v.kind.charAt(0) + v.kind.slice(1).toLowerCase()}</strong> <span className="ops-muted">{formatDate(v.visitDate)}</span><div className="ops-note-body">{v.summary}</div></div>
                {v.followUpOn && !v.followUpDone && (
                  <span className="ui-stack" style={{ alignItems: 'flex-end' }}>
                    <Badge tone="info">Follow up {formatDate(v.followUpOn)}</Badge>
                    {canWrite && <Button size="sm" variant="secondary" onClick={async () => { try { await completeVisitationFollowUp(v.id); toast.success('Follow-up done.'); visits.refresh(); } catch (e) { toast.error(normalizeError(e).message); } }}>Mark done</Button>}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {visits.items.length > 0 && <LoadMore shown={visits.items.length} hasMore={visits.hasMore} loading={visits.loadingMore} onMore={visits.loadMore} noun="visits" />}
        </Card>
      </div>
    </OpsPage>
  );
}
