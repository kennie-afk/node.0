import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, PageHeader, Select, Textarea } from '../../ui';
import { addInteraction, type Interaction } from '../../api/visitorsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function VisitorInteractionFormPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [type, setType] = useState<Interaction['type']>('CALL');
  const [summary, setSummary] = useState('');
  return (
    <OpsPage>
      <PageHeader title="Log a contact" crumbs={[{ label: 'Visitors', to: '/visitors' }, { label: 'Visitor', to: `/visitors/${id}` }, { label: 'Log a contact' }]} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => addInteraction(id, { type, summary }), 'Contact logged.')) navigate(`/visitors/${id}`); }}>
        <FormBanner error={error} />
        <Field label="How">{(c) => <Select {...c} value={type} onChange={(e) => setType(e.target.value as Interaction['type'])}><option value="CALL">Phone call</option><option value="SMS">Text message</option><option value="VISIT">Visit</option><option value="EMAIL">Email</option></Select>}</Field>
        <Field label="What happened" required error={fieldError('summary')}>{(c) => <Textarea {...c} rows={4} value={summary} maxLength={500} onChange={(e) => setSummary(e.target.value)} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={summary.trim().length < 2}>Save</Button><Button to={`/visitors/${id}`} variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
