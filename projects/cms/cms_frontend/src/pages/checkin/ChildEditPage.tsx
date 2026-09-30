import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, Textarea, useQuery } from '../../ui';
import { getChild, updateChild, type Child } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function ChildEditPage() {
  const id = Number(useParams().id);
  const child = useQuery(() => getChild(id), [id]);
  if (child.loading && !child.data) return <PageLoader />;
  if (child.error && !child.data) return <ErrorState message={child.error.message} onRetry={child.refetch} requestId={child.error.requestId} />;
  return <Form key={id} child={child.data!} />;
}

function Form({ child }: { child: Child }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [firstName, setFirstName] = useState(child.firstName);
  const [lastName, setLastName] = useState(child.lastName);
  const [allergies, setAllergies] = useState(child.allergies ?? '');
  const [medicalNotes, setMedicalNotes] = useState(child.medicalNotes ?? '');
  const [photoConsent, setPhotoConsent] = useState(child.photoConsent);
  const [isActive, setIsActive] = useState(child.isActive);
  return (
    <OpsPage>
      <PageHeader title={`Edit ${child.firstName}`} crumbs={[{ label: "Children's check-in", to: '/checkin/children' }, { label: `${child.firstName} ${child.lastName}`, to: `/checkin/children/${child.id}` }, { label: 'Edit' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await submit(() => updateChild(child.id, { firstName, lastName, allergies: allergies.trim() || null, medicalNotes: medicalNotes.trim() || null, photoConsent, isActive }), 'Saved.');
          if (ok) navigate(`/checkin/children/${child.id}`);
        }}
      >
        <FormBanner error={error} />
        <div className="ui-form-grid">
          <Field label="First name" required error={fieldError('firstName')}>{(c) => <Input {...c} value={firstName} onChange={(e) => setFirstName(e.target.value)} />}</Field>
          <Field label="Last name" required error={fieldError('lastName')}>{(c) => <Input {...c} value={lastName} onChange={(e) => setLastName(e.target.value)} />}</Field>
        </div>
        <Field label="Allergies" error={fieldError('allergies')}>{(c) => <Input {...c} value={allergies} onChange={(e) => setAllergies(e.target.value)} maxLength={300} />}</Field>
        <Field label="Medical notes" error={fieldError('medicalNotes')}>{(c) => <Textarea {...c} rows={3} value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} maxLength={500} />}</Field>
        <label className="ops-check"><input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} /> A parent has agreed to photos</label>
        <label className="ops-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (can be checked in)</label>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!firstName.trim() || !lastName.trim()}>Save</Button>
          <Button to={`/checkin/children/${child.id}`} variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
