import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, PageLoader, Select, useQuery } from '../../ui';
import { createSegment, listSegments, previewSegment, updateSegment, type Channel, type SegmentDefinition } from '../../api/commsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { MinistrySelect, SmallGroupSelect } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { buildDefinition } from '../../features/ops/lib/segments';

type FormState = Parameters<typeof buildDefinition>[0];

function toForm(def?: SegmentDefinition): FormState {
  const base: FormState = { type: def?.type ?? 'ALL', ministryId: '', smallGroupId: '', gender: '', city: '', county: '', statuses: def?.statuses?.join(', ') ?? '' };
  if (def?.type === 'MINISTRY') base.ministryId = def.ministryId;
  if (def?.type === 'SMALL_GROUP') base.smallGroupId = def.smallGroupId;
  if (def?.type === 'FILTER') {
    base.gender = def.gender ?? '';
    base.city = def.city ?? '';
    base.county = def.county ?? '';
  }
  return base;
}

export default function SegmentFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const all = useQuery(listSegments, [], { enabled: id !== null });
  if (id !== null && !all.data) return all.error ? <OpsPage><FormBanner error={all.error} /></OpsPage> : <PageLoader />;
  const existing = id !== null ? all.data!.find((s) => s.id === id) : undefined;
  return <SegmentForm key={id ?? 'new'} id={id} name0={existing?.name ?? ''} def0={existing?.definition} />;
}

function SegmentForm({ id, name0, def0 }: { id: number | null; name0: string; def0?: SegmentDefinition }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState(name0);
  const [form, setForm] = useState<FormState>(toForm(def0));
  const [channel, setChannel] = useState<Channel>('SMS');
  const [saved, setSaved] = useState(0);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const preview = useQuery(() => previewSegment(id!, channel), [id, channel, saved], { enabled: id !== null });
  const definition = buildDefinition(form);

  const save = async () => {
    if (!definition) return;
    let createdId: number | null = null;
    const ok = await submit(async () => {
      if (id) await updateSegment(id, { name, definition });
      else createdId = (await createSegment({ name, definition })).id;
    }, 'Audience saved.');
    if (!ok) return;
    if (createdId) navigate(`/comms/segments/${createdId}/edit`);
    else setSaved((n) => n + 1);
  };

  return (
    <OpsPage>
      <PageHeader title={id ? 'Edit audience' : 'New audience'} crumbs={[{ label: 'Communications', to: '/comms/segments' }, { label: id ? 'Edit audience' : 'New audience' }]} />
      <div className="ops-split">
        <form className="ui-form" style={{ maxWidth: 'none' }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <FormBanner error={error} />
          <Field label="Name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
          <Field label="Who is in it">
            {(c) => (
              <Select {...c} value={form.type} onChange={(e) => set('type', e.target.value as FormState['type'])}>
                <option value="ALL">Every member</option>
                <option value="MINISTRY">Members of a ministry</option>
                <option value="SMALL_GROUP">Members of a small group</option>
                <option value="FILTER">Members matching a filter</option>
              </Select>
            )}
          </Field>
          {form.type === 'MINISTRY' && <Field label="Ministry" required>{(c) => <MinistrySelect {...c} value={form.ministryId} onChange={(v) => set('ministryId', v)} />}</Field>}
          {form.type === 'SMALL_GROUP' && <Field label="Small group" required>{(c) => <SmallGroupSelect {...c} value={form.smallGroupId} onChange={(v) => set('smallGroupId', v)} />}</Field>}
          {form.type === 'FILTER' && (
            <div className="ui-form-grid">
              <Field label="Gender">{(c) => <Select {...c} value={form.gender} onChange={(e) => set('gender', e.target.value as FormState['gender'])}><option value="">Any</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option></Select>}</Field>
              <Field label="City">{(c) => <Input {...c} value={form.city} onChange={(e) => set('city', e.target.value)} />}</Field>
              <Field label="County">{(c) => <Input {...c} value={form.county} onChange={(e) => set('county', e.target.value)} />}</Field>
            </div>
          )}
          <Field label="Only members with status" hint="Optional. Separate several with commas, e.g. Active.">{(c) => <Input {...c} value={form.statuses} onChange={(e) => set('statuses', e.target.value)} />}</Field>
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || !definition}>{id ? 'Save and refresh preview' : 'Save audience'}</Button>
            <Button to="/comms/segments" variant="ghost">Back</Button>
          </div>
        </form>
        <Card title="Audience preview" subtitle={id ? 'Counts are for the audience as last saved' : 'Save first to see who it reaches'} actions={id ? <Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}><option value="SMS">By SMS</option><option value="EMAIL">By email</option></Select> : undefined}>
          {id === null ? (
            <Notice tone="info">The preview is computed on the server from the saved audience, so it appears after the first save.</Notice>
          ) : preview.loading && !preview.data ? (
            <span className="ops-muted">Counting…</span>
          ) : preview.data ? (
            <div className="ui-stack">
              <div><strong className="ui-num">{preview.data.reachable}</strong> reachable of <span className="ui-num">{preview.data.total}</span> in the audience</div>
              <div className="ops-muted">{preview.data.optedOut} opted out · {preview.data.total - preview.data.reachable - preview.data.optedOut} without a {channel === 'SMS' ? 'phone number' : 'email address'}</div>
              <ul className="ops-list">{preview.data.sample.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
            </div>
          ) : (
            <span className="ops-muted">{preview.error?.message}</span>
          )}
        </Card>
      </div>
    </OpsPage>
  );
}
