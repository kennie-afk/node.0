import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Field, PageHeader, PageLoader, Select, Textarea, useKeysetList } from '../../ui';
import { updatePrayerRequest, type PrayerStatus } from '../../api/careApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import type { PrayerRequest } from '../../api/careApi';

export default function PrayerRequestUpdatePage() {
  const id = Number(useParams().id);
  const all = useKeysetList<PrayerRequest>('/care/prayer-requests', {}, { limit: 200 });
  if (all.loading && all.items.length === 0) return <PageLoader />;
  if (all.error && all.items.length === 0) return <ErrorState message={all.error.message} onRetry={all.refresh} />;
  const request = all.items.find((p) => p.id === id);
  if (!request) return <OpsPage><EmptyState title="Request not found" message="It may be older than the most recent 200; open it from the list." action={<Button to="/care/prayer-requests">Back to requests</Button>} /></OpsPage>;
  return <Form request={request} />;
}

function Form({ request }: { request: PrayerRequest }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [status, setStatus] = useState<PrayerStatus>(request.status);
  const [note, setNote] = useState(request.answeredNote ?? '');
  return (
    <OpsPage>
      <PageHeader title="Update prayer request" crumbs={[{ label: 'Pastoral care', to: '/care/prayer-requests' }, { label: 'Update' }]} subtitle={request.body} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => updatePrayerRequest(request.id, { status, answeredNote: note.trim() || null }), 'Request updated.')) navigate('/care/prayer-requests'); }}>
        <FormBanner error={error} />
        <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value as PrayerStatus)}><option value="OPEN">Open</option><option value="ANSWERED">Answered</option><option value="CLOSED">Closed</option></Select>}</Field>
        <Field label="How it was answered" error={fieldError('answeredNote')}>{(c) => <Textarea {...c} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy}>Save</Button><Button to="/care/prayer-requests" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
