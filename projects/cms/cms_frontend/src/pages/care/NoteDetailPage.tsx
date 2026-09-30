import { useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Badge, Button, Card, ErrorState, InlineConfirm, PageHeader, PageLoader, formatDate, useQuery, useToast } from '../../ui';
import { deleteNote, getNote } from '../../api/careApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { memberName } from '../../features/ops/lookups';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';

export default function NoteDetailPage() {
  const id = Number(useParams().id);
  const note = useQuery(() => getNote(id), [id]);
  const who = useQuery(() => memberName(note.data!.memberId), [note.data?.memberId], { enabled: Boolean(note.data) });
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (note.loading && !note.data) return <PageLoader />;
  if (note.error && !note.data) return <ErrorState message={note.error.message} onRetry={note.refetch} requestId={note.error.requestId} />;
  const n = note.data!;
  return (
    <OpsPage>
      <PageHeader title={`${n.kind.charAt(0) + n.kind.slice(1).toLowerCase()} note`} crumbs={[{ label: 'Pastoral care', to: '/care' }, { label: who.data ?? 'Member', to: `/care/members/${n.memberId}` }, { label: 'Note' }]} subtitle={<>{who.data ?? ''} · {formatDate(n.occurredOn)} {n.isConfidential && <Badge tone="warn">Confidential</Badge>}</>}
        actions={can('care:write') && !n.redacted ? <><Button to={`/care/notes/${id}/edit`} variant="secondary">Edit</Button><InlineConfirm label="Delete" question="Delete this note for good?" onConfirm={async () => { try { await deleteNote(id); toast.success('Note deleted.'); navigate(`/care/members/${n.memberId}`); } catch (e) { toast.error(normalizeError(e).message); } }} /></> : undefined} />
      {n.isConfidential && !n.redacted && <Notice tone="warn" title="You opened a confidential note">This access has been recorded in the audit log with your name and the time.</Notice>}
      <Card>
        {n.redacted ? <div className="ops-redacted"><Lock size={12} aria-hidden /> This confidential note was written by someone else. Only its author and administrators can read it.</div> : <div className="ops-note-body">{n.body}</div>}
      </Card>
      {n.followUpOn && <div className="ops-muted">Follow-up {n.followUpDone ? 'done' : `due ${formatDate(n.followUpOn)}`}.</div>}
    </OpsPage>
  );
}
