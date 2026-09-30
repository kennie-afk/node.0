import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, DateInput, Field, Input, PageHeader, Textarea } from '../../ui';
import { createChild, type GuardianInput } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

interface GuardianRow extends GuardianInput {
  key: number;
  memberId: number | null;
}

let rowKey = 0;
const blankGuardian = (): GuardianRow => ({ key: ++rowKey, name: '', phone: '', relationship: '', memberId: null, isAuthorizedPickup: true });

export default function ChildFormPage() {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [guardians, setGuardians] = useState<GuardianRow[]>([blankGuardian()]);
  const update = (key: number, patch: Partial<GuardianRow>) => setGuardians((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = guardians.filter((g) => g.name.trim().length >= 2);

  return (
    <OpsPage>
      <PageHeader title="Register a child" crumbs={[{ label: "Children's check-in", to: '/checkin/children' }, { label: 'Register a child' }]} />
      <form
        className="ui-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          let id: number | null = null;
          const ok = await submit(async () => {
            id = (await createChild({
              firstName, lastName, dateOfBirth,
              allergies: allergies.trim() || null,
              medicalNotes: medicalNotes.trim() || null,
              photoConsent,
              guardians: filled.map((g) => ({ name: g.name, memberId: g.memberId, isAuthorizedPickup: g.isAuthorizedPickup, phone: g.phone?.trim() || null, relationship: g.relationship?.trim() || undefined }))
            })).id;
          }, 'Child registered.');
          if (ok && id) navigate(`/checkin/children/${id}`);
        }}
      >
        <FormBanner error={error} />
        <Card title="Child">
          <div className="ui-form" style={{ maxWidth: 'none' }}>
            <div className="ui-form-grid">
              <Field label="First name" required error={fieldError('firstName')}>{(c) => <Input {...c} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} />}</Field>
              <Field label="Last name" required error={fieldError('lastName')}>{(c) => <Input {...c} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />}</Field>
              <Field label="Date of birth" required error={fieldError('dateOfBirth')}>{(c) => <DateInput {...c} value={dateOfBirth} onChange={setDateOfBirth} max={new Date().toISOString().slice(0, 10)} />}</Field>
            </div>
            <Field label="Allergies" hint="Shown in red on the label and at check-out." error={fieldError('allergies')}>{(c) => <Input {...c} value={allergies} onChange={(e) => setAllergies(e.target.value)} maxLength={300} />}</Field>
            <Field label="Medical notes" error={fieldError('medicalNotes')}>{(c) => <Textarea {...c} rows={2} value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} maxLength={500} />}</Field>
            <label className="ops-check"><input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} /> A parent has agreed to photos of the child</label>
          </div>
        </Card>
        <Card title="Guardians" subtitle="Only guardians marked 'can collect' may take the child home" actions={<Button variant="secondary" size="sm" type="button" icon={<Plus size={12} aria-hidden />} onClick={() => setGuardians((r) => [...r, blankGuardian()])} disabled={guardians.length >= 10}>Add guardian</Button>}>
          <div className="ui-stack">
            {guardians.map((g, index) => (
              <div key={g.key} className="ui-stack" style={{ borderBottom: '1px solid var(--ui-border)', paddingBottom: 10 }}>
                <div className="ui-form-grid">
                  <Field label={`Guardian ${index + 1} name`} error={fieldError(`guardians.${index}.name`)}>{(c) => <Input {...c} value={g.name} onChange={(e) => update(g.key, { name: e.target.value })} maxLength={150} />}</Field>
                  <Field label="Phone">{(c) => <Input {...c} inputMode="tel" value={g.phone ?? ''} onChange={(e) => update(g.key, { phone: e.target.value })} maxLength={30} />}</Field>
                  <Field label="Relationship">{(c) => <Input {...c} value={g.relationship ?? ''} onChange={(e) => update(g.key, { relationship: e.target.value })} maxLength={40} />}</Field>
                </div>
                <Field label="Linked member" hint="Optional. Link a church member to keep contact details in one place.">{(c) => <MemberPicker {...c} value={g.memberId} onChange={(id) => update(g.key, { memberId: id })} />}</Field>
                <div className="ui-row" style={{ justifyContent: 'space-between' }}>
                  <label className="ops-check"><input type="checkbox" checked={g.isAuthorizedPickup ?? false} onChange={(e) => update(g.key, { isAuthorizedPickup: e.target.checked })} /> Can collect the child</label>
                  {guardians.length > 1 && <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={12} aria-hidden />} onClick={() => setGuardians((r) => r.filter((x) => x.key !== g.key))}>Remove</Button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!firstName.trim() || !lastName.trim() || !dateOfBirth || filled.length === 0}>Register child</Button>
          <Button to="/checkin/children" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
