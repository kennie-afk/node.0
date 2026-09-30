import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, DateInput, ErrorState, Field, Input, PageHeader, PageLoader, Textarea, todayISO, useQuery } from '../../ui';
import { createVisitor, getVisitor, updateVisitor, type VisitorDetail } from '../../api/visitorsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function VisitorFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const visitor = useQuery(() => getVisitor(id!), [id], { enabled: id !== null });
  if (id !== null && !visitor.data) return visitor.error ? <ErrorState message={visitor.error.message} onRetry={visitor.refetch} /> : <PageLoader />;
  return <Form key={id ?? 'new'} id={id} visitor={visitor.data} />;
}

function Form({ id, visitor }: { id: number | null; visitor?: VisitorDetail }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [firstName, setFirstName] = useState(visitor?.firstName ?? '');
  const [lastName, setLastName] = useState(visitor?.lastName ?? '');
  const [phone, setPhone] = useState(visitor?.phone ?? '');
  const [email, setEmail] = useState(visitor?.email ?? '');
  const [source, setSource] = useState(visitor?.source ?? '');
  const [notes, setNotes] = useState(visitor?.notes ?? '');
  const [firstVisit, setFirstVisit] = useState(visitor?.firstVisitDate ?? todayISO());
  const [assigned, setAssigned] = useState<number | null>(visitor?.assignedMemberId ?? null);
  const [autoTask, setAutoTask] = useState(true);
  return (
    <OpsPage>
      <PageHeader title={id ? 'Edit visitor' : 'Record a visitor'} crumbs={[{ label: 'Visitors', to: '/visitors' }, { label: id ? 'Edit' : 'New' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          let dest = id;
          const ok = await submit(async () => {
            if (id) await updateVisitor(id, { firstName, lastName, phone: phone.trim() || null, email: email.trim() || null, source: source.trim() || null, notes: notes.trim() || null, assignedMemberId: assigned });
            else dest = (await createVisitor({ firstName, lastName, phone: phone.trim() || null, email: email.trim() || null, source: source.trim() || null, notes: notes.trim() || null, firstVisitDate: firstVisit, assignedMemberId: assigned, autoTask })).id;
          }, 'Visitor saved.');
          if (ok && dest) navigate(`/visitors/${dest}`);
        }}
      >
        <FormBanner error={error} />
        <div className="ui-form-grid">
          <Field label="First name" required error={fieldError('firstName')}>{(c) => <Input {...c} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} />}</Field>
          <Field label="Last name" required error={fieldError('lastName')}>{(c) => <Input {...c} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />}</Field>
        </div>
        <div className="ui-form-grid">
          <Field label="Phone" error={fieldError('phone')}>{(c) => <Input {...c} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />}</Field>
          <Field label="Email" error={fieldError('email')}>{(c) => <Input {...c} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} />}</Field>
        </div>
        {!id && <Field label="First visit">{(c) => <DateInput {...c} value={firstVisit} onChange={setFirstVisit} max={todayISO()} />}</Field>}
        <Field label="How did they hear of us" error={fieldError('source')}>{(c) => <Input {...c} value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />}</Field>
        <Field label="Who follows up" hint="A member to call or visit them.">{(c) => <MemberPicker {...c} value={assigned} onChange={setAssigned} />}</Field>
        <Field label="Notes" error={fieldError('notes')}>{(c) => <Textarea {...c} rows={3} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />}</Field>
        {!id && <label className="ops-check"><input type="checkbox" checked={autoTask} onChange={(e) => setAutoTask(e.target.checked)} /> Create a "welcome call or visit" task due in two days</label>}
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!firstName.trim() || !lastName.trim()}>Save visitor</Button>
          <Button to={id ? `/visitors/${id}` : '/visitors'} variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
