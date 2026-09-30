import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, useQuery } from '../../ui';
import { addGuardian, getChild, updateGuardian, type Child, type Guardian } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

/** New: /checkin/children/:id/guardians/new. Edit: /checkin/guardians/:gid/edit?childId=... */
export default function GuardianFormPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const editing = Boolean(params.gid);
  const childId = Number(editing ? search.get('childId') : params.id);
  const child = useQuery(() => getChild(childId), [childId]);
  if (child.loading && !child.data) return <PageLoader />;
  if (child.error && !child.data) return <ErrorState message={child.error.message} onRetry={child.refetch} requestId={child.error.requestId} />;
  const existing = editing ? child.data!.guardians?.find((g) => g.id === Number(params.gid)) : undefined;
  return <Form key={params.gid ?? 'new'} child={child.data!} existing={existing} />;
}

function Form({ child, existing }: { child: Child; existing?: Guardian }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [memberId, setMemberId] = useState<number | null>(existing?.memberId ?? null);
  const [pickup, setPickup] = useState(existing?.isAuthorizedPickup ?? true);
  return (
    <OpsPage>
      <PageHeader title={existing ? 'Edit guardian' : 'Add guardian'} crumbs={[{ label: "Children's check-in", to: '/checkin/children' }, { label: `${child.firstName} ${child.lastName}`, to: `/checkin/children/${child.id}` }, { label: existing ? 'Edit guardian' : 'Add guardian' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await submit(() => (existing ? updateGuardian(existing.id, { name, phone: phone.trim() || null, relationship: relationship.trim() || undefined, isAuthorizedPickup: pickup }) : addGuardian(child.id, { name, phone: phone.trim() || null, relationship: relationship.trim() || undefined, memberId, isAuthorizedPickup: pickup })), 'Guardian saved.');
          if (ok) navigate(`/checkin/children/${child.id}`);
        }}
      >
        <FormBanner error={error} />
        <Field label="Name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}</Field>
        <div className="ui-form-grid">
          <Field label="Phone" error={fieldError('phone')}>{(c) => <Input {...c} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />}</Field>
          <Field label="Relationship">{(c) => <Input {...c} value={relationship} onChange={(e) => setRelationship(e.target.value)} maxLength={40} />}</Field>
        </div>
        {!existing && <Field label="Linked member" hint="Optional.">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>}
        <label className="ops-check"><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Can collect the child</label>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>Save guardian</Button>
          <Button to={`/checkin/children/${child.id}`} variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
