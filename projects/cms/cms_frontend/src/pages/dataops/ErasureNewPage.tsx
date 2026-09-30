import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, PageHeader, Textarea } from '../../ui';
import { requestErasure } from '../../api/dataopsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function ErasureNewPage() {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [memberId, setMemberId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  return (
    <OpsPage>
      <PageHeader title="New erasure request" crumbs={[{ label: 'Erasure requests', to: '/data/erasure' }, { label: 'New' }]} />
      <Notice tone="warn" title="Nothing is erased yet">This only records the request. A second step, "Carry out", actually removes the data, so you can check the member's identity first.</Notice>
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => requestErasure(memberId!, reason), 'Request recorded.')) navigate('/data/erasure'); }}>
        <FormBanner error={error} />
        <Field label="Member" required error={fieldError('memberId')}>{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
        <Field label="Why and who asked" required error={fieldError('reason')} hint="For example: requested in writing by the member on 12 March.">{(c) => <Textarea {...c} rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={memberId === null || reason.trim().length < 5}>Record request</Button><Button to="/data/erasure" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
