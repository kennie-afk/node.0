import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useQuery } from '../../ui';
import { createCampaign, listSegments, listTemplates, previewSegment, type Channel } from '../../api/commsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { renderPreview, smsSegments } from '../../features/ops/lib/sms';

export default function CampaignFormPage() {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('SMS');
  const [segmentId, setSegmentId] = useState<number | ''>('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const segments = useQuery(listSegments, []);
  const templates = useQuery(listTemplates, []);
  const preview = useQuery(() => previewSegment(Number(segmentId), channel), [segmentId, channel], { enabled: segmentId !== '' });

  const usable = useMemo(() => (templates.data ?? []).filter((t) => t.isActive && t.channel === channel), [templates.data, channel]);
  const sms = smsSegments(body);
  const sample = preview.data?.sample[0]?.name.split(' ') ?? ['Amina', 'Wanjiru'];

  const pickTemplate = (id: number | '') => {
    setTemplateId(id);
    const t = usable.find((x) => x.id === id);
    if (t) {
      setBody(t.body);
      setSubject(t.subject ?? '');
    }
  };

  const save = async () => {
    const created = await (async () => {
      let id: number | null = null;
      const ok = await submit(async () => {
        const c = await createCampaign({
          name,
          channel,
          segmentId: Number(segmentId),
          templateId: templateId === '' ? null : templateId,
          subject: channel === 'EMAIL' ? subject || null : null,
          body
        });
        id = c.id;
      }, 'Draft saved. Review it, then send.');
      return ok ? id : null;
    })();
    if (created) navigate(`/comms/campaigns/${created}`);
  };

  return (
    <OpsPage>
      <PageHeader title="New campaign" crumbs={[{ label: 'Communications', to: '/comms/campaigns' }, { label: 'New campaign' }]} />
      <form
        className="ops-split"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="ui-form" style={{ maxWidth: 'none' }}>
          <FormBanner error={error} />
          <div className="ui-form-grid">
            <Field label="Campaign name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}</Field>
            <Field label="Channel">
              {(c) => (
                <Select {...c} value={channel} onChange={(e) => { setChannel(e.target.value as Channel); setTemplateId(''); }}>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </Select>
              )}
            </Field>
            <Field label="Audience" required error={fieldError('segmentId')} hint={segments.data?.length === 0 ? 'Create an audience first (Communications > Audiences).' : undefined}>
              {(c) => (
                <Select {...c} value={segmentId} onChange={(e) => setSegmentId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Choose an audience</option>
                  {(segments.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Start from a template">
              {(c) => (
                <Select {...c} value={templateId} onChange={(e) => pickTemplate(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Write from scratch</option>
                  {usable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          {channel === 'EMAIL' && <Field label="Subject" error={fieldError('subject')}>{(c) => <Input {...c} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />}</Field>}
          <Field
            label="Message"
            required
            error={fieldError('body')}
            hint={channel === 'SMS' ? `${sms.characters} characters, ${sms.segments} SMS part${sms.segments === 1 ? '' : 's'} (${sms.encoding}, ${sms.perSegment} per part). Use {{firstName}} and {{lastName}} to personalise.` : 'Use {{firstName}} and {{lastName}} to personalise.'}
          >
            {(c) => <Textarea {...c} rows={7} maxLength={1600} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || segmentId === '' || !body.trim()}>Save draft</Button>
            <Button to="/comms/campaigns" variant="ghost">Cancel</Button>
          </div>
        </div>

        <div className="ui-stack">
          <Card title="Who will get it" subtitle="Based on the audience as saved">
            {segmentId === '' ? (
              <span className="ops-muted">Choose an audience to see how many people it reaches.</span>
            ) : preview.loading && !preview.data ? (
              <span className="ops-muted">Counting…</span>
            ) : preview.data ? (
              <div className="ui-stack">
                <div><strong className="ui-num">{preview.data.reachable}</strong> of <span className="ui-num">{preview.data.total}</span> people can be reached by {channel === 'SMS' ? 'SMS' : 'email'}.</div>
                {preview.data.optedOut > 0 && <Notice tone="info">{preview.data.optedOut} opted out and will be skipped.</Notice>}
                {preview.data.total - preview.data.reachable - preview.data.optedOut > 0 && <Notice tone="warn">{preview.data.total - preview.data.reachable - preview.data.optedOut} have no {channel === 'SMS' ? 'phone number' : 'email address'} on file.</Notice>}
                <div className="ops-muted">e.g. {preview.data.sample.map((p) => p.name).join(', ')}</div>
              </div>
            ) : (
              <span className="ops-muted">{preview.error?.message ?? 'Could not count this audience.'}</span>
            )}
          </Card>
          <Card title="Preview" subtitle={`As ${sample.join(' ')} would see it`}>
            <div className="ops-note-body">{body ? renderPreview(body, { firstName: sample[0] ?? '', lastName: sample.slice(1).join(' ') }) : <span className="ops-muted">Your message appears here.</span>}</div>
          </Card>
        </div>
      </form>
    </OpsPage>
  );
}
