import { useState } from 'react';
import { Button, Field, PageHeader, Textarea } from '../../ui';
import { submitPrayer } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { MeTabs } from './MeTabs';

export default function MePrayerPage() {
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [sent, setSent] = useState(false);
  return (
    <OpsPage>
      <PageHeader title="Prayer" subtitle="Share a request with the pastoral team." />
      <MeTabs active="prayer" />
      {sent && <Notice tone="ok" title="Received">Your request was sent. Thank you for trusting us with it.</Notice>}
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await submit(() => submitPrayer({ body, isPrivate }), 'Your request was sent.')) {
            setBody('');
            setSent(true);
          }
        }}
      >
        <FormBanner error={error} />
        <Field label="Your request" required error={fieldError('body')}>{(c) => <Textarea {...c} rows={6} maxLength={2000} value={body} onChange={(e) => { setBody(e.target.value); setSent(false); }} />}</Field>
        <label className="ops-check"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Keep it private to the pastoral team</label>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={body.trim().length < 2}>Send request</Button></div>
      </form>
    </OpsPage>
  );
}
