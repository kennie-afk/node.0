import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, PageHeader, Textarea } from '../../ui';
import { createTeam } from '../../api/volunteersApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MinistrySelect } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function TeamFormPage() {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ministryId, setMinistryId] = useState<number | ''>('');
  return (
    <OpsPage>
      <PageHeader title="New team" crumbs={[{ label: 'Volunteers', to: '/volunteers/teams' }, { label: 'New team' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          let id: number | null = null;
          const ok = await submit(async () => { id = (await createTeam({ name, description: description || null, ministryId: ministryId === '' ? null : ministryId })).id; }, 'Team created.');
          if (ok && id) navigate(`/volunteers/teams/${id}`);
        }}
      >
        <FormBanner error={error} />
        <Field label="Team name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
        <Field label="Ministry" hint="Optional. Links the team to a ministry.">{(c) => <MinistrySelect {...c} value={ministryId} onChange={setMinistryId} />}</Field>
        <Field label="What the team does" error={fieldError('description')}>{(c) => <Textarea {...c} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>Create team</Button>
          <Button to="/volunteers/teams" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
