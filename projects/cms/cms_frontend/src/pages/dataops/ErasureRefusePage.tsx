import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, PageHeader, Textarea } from '../../ui';
import { refuseErasure } from '../../api/dataopsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function ErasureRefusePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [reason, setReason] = useState('');
  return (
    <OpsPage>
      <PageHeader title="Refuse an erasure request" crumbs={[{ label: 'Erasure requests', to: '/data/erasure' }, { label: 'Refuse' }]} subtitle="Record the legal or safeguarding reason. It is kept on the request." />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => refuseErasure(id, reason), 'Request refused and the reason recorded.')) navigate('/data/erasure'); }}>
        <FormBanner error={error} />
        <Field label="Reason" required error={fieldError('reason')}>{(c) => <Textarea {...c} rows={4} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="dangerSolid" loading={busy} disabled={reason.trim().length < 5}>Refuse request</Button><Button to="/data/erasure" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
