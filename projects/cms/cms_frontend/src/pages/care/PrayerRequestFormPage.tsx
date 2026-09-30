import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, PageHeader, Textarea } from '../../ui';
import { createPrayerRequest } from '../../api/careApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function PrayerRequestFormPage() {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [memberId, setMemberId] = useState<number | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  return (
    <OpsPage>
      <PageHeader title="New prayer request" crumbs={[{ label: 'Pastoral care', to: '/care/prayer-requests' }, { label: 'New request' }]} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => createPrayerRequest({ memberId, requesterName: memberId ? null : requesterName.trim() || null, body, isPrivate }), 'Request recorded.')) navigate('/care/prayer-requests'); }}>
        <FormBanner error={error} />
        <Field label="Member" hint="Leave empty for someone who is not a member.">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
        {memberId === null && <Field label="Their name" error={fieldError('requesterName')}>{(c) => <Input {...c} value={requesterName} maxLength={150} onChange={(e) => setRequesterName(e.target.value)} />}</Field>}
        <Field label="Request" required error={fieldError('body')}>{(c) => <Textarea {...c} rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <label className="ops-check"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private: do not share beyond the care team</label>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={body.trim().length < 2}>Save request</Button><Button to="/care/prayer-requests" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
