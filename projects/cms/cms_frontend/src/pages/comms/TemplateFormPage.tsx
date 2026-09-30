import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, Input, PageHeader, Select, Textarea, useQuery, PageLoader } from '../../ui';
import { createTemplate, listTemplates, updateTemplate, type Channel } from '../../api/commsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { smsSegments } from '../../features/ops/lib/sms';

export default function TemplateFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const all = useQuery(listTemplates, [], { enabled: id !== null });
  if (id !== null && !all.data) return all.error ? <OpsPage><FormBanner error={all.error} /></OpsPage> : <PageLoader />;
  const existing = id !== null ? all.data!.find((t) => t.id === id) : undefined;
  return <TemplateForm key={id ?? 'new'} id={id} initial={existing} />;
}

function TemplateForm({ id, initial }: { id: number | null; initial?: { name: string; channel: Channel; subject: string | null; body: string; isActive: boolean } }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState(initial?.name ?? '');
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? 'SMS');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const sms = smsSegments(body);

  return (
    <OpsPage>
      <PageHeader title={id ? 'Edit template' : 'New template'} crumbs={[{ label: 'Communications', to: '/comms/templates' }, { label: id ? 'Edit template' : 'New template' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await submit(() => (id ? updateTemplate(id, { name, subject: channel === 'EMAIL' ? subject || null : null, body, isActive }) : createTemplate({ name, channel, subject: channel === 'EMAIL' ? subject || null : null, body })), 'Template saved.');
          if (ok) navigate('/comms/templates');
        }}
      >
        <FormBanner error={error} />
        <Field label="Name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
        <Field label="Channel" hint={id ? 'A template keeps the channel it was created for.' : undefined}>
          {(c) => (
            <Select {...c} value={channel} disabled={id !== null} onChange={(e) => setChannel(e.target.value as Channel)}>
              <option value="SMS">SMS</option>
              <option value="EMAIL">Email</option>
            </Select>
          )}
        </Field>
        {channel === 'EMAIL' && <Field label="Subject" error={fieldError('subject')}>{(c) => <Input {...c} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />}</Field>}
        <Field label="Message" required error={fieldError('body')} hint={channel === 'SMS' ? `${sms.characters} characters, ${sms.segments} SMS part${sms.segments === 1 ? '' : 's'}. {{firstName}} and {{lastName}} are filled in per person.` : '{{firstName}} and {{lastName}} are filled in per person.'}>
          {(c) => <Textarea {...c} rows={7} maxLength={1600} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        {id !== null && (
          <label className="ops-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Available when writing a campaign</label>
        )}
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || !body.trim()}>Save template</Button>
          <Button to="/comms/templates" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
