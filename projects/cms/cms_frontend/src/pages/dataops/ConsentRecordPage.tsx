import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, Input, PageHeader, Select, useQuery } from '../../ui';
import { CONSENT_PURPOSES, recordConsent, type Consent, type ConsentChannel, type ConsentPurpose } from '../../api/dataopsApi';
import { memberName } from '../../features/ops/lookups';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { PURPOSE_LABEL } from '../../features/ops/lib/consent';

export default function ConsentRecordPage() {
  const memberId = Number(useParams().memberId);
  const navigate = useNavigate();
  const name = useQuery(() => memberName(memberId), [memberId]);
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [purpose, setPurpose] = useState<ConsentPurpose>('COMMUNICATIONS');
  const [channel, setChannel] = useState<ConsentChannel>('ANY');
  const [granted, setGranted] = useState(true);
  const [source, setSource] = useState<Consent['source']>('PAPER');
  const [notes, setNotes] = useState('');
  return (
    <OpsPage>
      <PageHeader title="Record a choice" crumbs={[{ label: 'Consent records', to: '/data/consents' }, { label: name.data ?? 'Member' }, { label: 'Record' }]} subtitle={name.data ? `For ${name.data}` : undefined} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => recordConsent(memberId, { purpose, channel, granted, source, notes: notes.trim() || null }), 'Choice recorded.')) navigate('/data/consents'); }}>
        <FormBanner error={error} />
        <Field label="Purpose">{(c) => <Select {...c} value={purpose} onChange={(e) => setPurpose(e.target.value as ConsentPurpose)}>{CONSENT_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}</Select>}</Field>
        <div className="ui-form-grid">
          <Field label="Channel">{(c) => <Select {...c} value={channel} onChange={(e) => setChannel(e.target.value as ConsentChannel)}><option value="ANY">Any way</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></Select>}</Field>
          <Field label="Choice">{(c) => <Select {...c} value={granted ? 'yes' : 'no'} onChange={(e) => setGranted(e.target.value === 'yes')}><option value="yes">Agreed</option><option value="no">Does not agree</option></Select>}</Field>
          <Field label="How you know">{(c) => <Select {...c} value={source} onChange={(e) => setSource(e.target.value as Consent['source'])}><option value="PAPER">Signed paper form</option><option value="STAFF">Told staff in person</option><option value="WEB">Web form</option><option value="IMPORT">From an import</option></Select>}</Field>
        </div>
        <Field label="Note" error={fieldError('notes')}>{(c) => <Input {...c} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy}>Record</Button><Button to="/data/consents" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
