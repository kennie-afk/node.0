import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, DateInput, ErrorState, Field, PageHeader, PageLoader, Select, Textarea, todayISO, useQuery } from '../../ui';
import { createNote, getNote, updateNote, type CareNote, type NoteKind } from '../../api/careApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { ConfidentialityNotice } from './ConfidentialityNotice';

const KINDS: NoteKind[] = ['PASTORAL', 'COUNSELING', 'HOSPITAL', 'BEREAVEMENT', 'OTHER'];

export default function NoteFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const note = useQuery(() => getNote(id!), [id], { enabled: id !== null });
  if (id !== null && !note.data) return note.error ? <ErrorState message={note.error.message} onRetry={note.refetch} requestId={note.error.requestId} /> : <PageLoader />;
  return <Form key={id ?? 'new'} note={note.data} />;
}

function Form({ note }: { note?: CareNote }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [memberId, setMemberId] = useState<number | null>(note?.memberId ?? (search.get('memberId') ? Number(search.get('memberId')) : null));
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? 'PASTORAL');
  const [body, setBody] = useState(note?.body ?? '');
  const [confidential, setConfidential] = useState(note?.isConfidential ?? true);
  const [occurredOn, setOccurredOn] = useState(note?.occurredOn ?? todayISO());
  const [followUpOn, setFollowUpOn] = useState(note?.followUpOn ?? '');
  const [followUpDone, setFollowUpDone] = useState(note?.followUpDone ?? false);
  const editing = Boolean(note);
  if (note?.redacted) return <OpsPage><PageHeader title="Edit care note" /><Notice tone="bad" title="Hidden">This confidential note belongs to someone else, so you cannot edit it.</Notice></OpsPage>;

  return (
    <OpsPage>
      <PageHeader title={editing ? 'Edit care note' : 'New care note'} crumbs={[{ label: 'Pastoral care', to: '/care' }, { label: editing ? 'Edit note' : 'New note' }]} />
      <ConfidentialityNotice mode="write" />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const dest = memberId;
          const ok = await submit(async () => {
            if (note) await updateNote(note.id, { body, kind, isConfidential: confidential, followUpOn: followUpOn || null, followUpDone });
            else await createNote({ memberId: memberId!, kind, body, isConfidential: confidential, occurredOn, followUpOn: followUpOn || null });
          }, 'Note saved.');
          if (ok) navigate(`/care/members/${dest ?? note?.memberId}`);
        }}
      >
        <FormBanner error={error} />
        {!editing && <Field label="Member" required error={fieldError('memberId')}>{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>}
        <div className="ui-form-grid">
          <Field label="Kind">{(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>{KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}</Select>}</Field>
          {!editing && <Field label="Date">{(c) => <DateInput {...c} value={occurredOn} onChange={setOccurredOn} max={todayISO()} />}</Field>}
        </div>
        <Field label="Note" required error={fieldError('body')}>{(c) => <Textarea {...c} rows={8} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <label className="ops-check"><input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} /> Confidential: only I and administrators can read it</label>
        <div className="ui-form-grid">
          <Field label="Follow up on" hint="Optional. Appears on the follow-ups list.">{(c) => <DateInput {...c} value={followUpOn} onChange={setFollowUpOn} />}</Field>
          {editing && followUpOn && <label className="ops-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={followUpDone} onChange={(e) => setFollowUpDone(e.target.checked)} /> Follow-up done</label>}
        </div>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={body.trim().length < 2 || (!editing && memberId === null)}>Save note</Button><Button to={memberId ? `/care/members/${memberId}` : '/care'} variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
