import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DateInput, Field, PageHeader, Select, Textarea, todayISO } from '../../ui';
import { logVisitation, type VisitationKind } from '../../api/careApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function VisitationFormPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [memberId, setMemberId] = useState<number | null>(search.get('memberId') ? Number(search.get('memberId')) : null);
  const [kind, setKind] = useState<VisitationKind>('HOME');
  const [visitDate, setVisitDate] = useState(todayISO());
  const [summary, setSummary] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  return (
    <OpsPage>
      <PageHeader title="Log a visit" crumbs={[{ label: 'Pastoral care', to: '/care' }, { label: 'Log a visit' }]} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => logVisitation({ memberId: memberId!, kind, visitDate, summary, followUpOn: followUpOn || null }), 'Visit logged.')) navigate(`/care/members/${memberId}`); }}>
        <FormBanner error={error} />
        <Field label="Member" required error={fieldError('memberId')}>{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
        <div className="ui-form-grid">
          <Field label="Where">{(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as VisitationKind)}><option value="HOME">Home</option><option value="HOSPITAL">Hospital</option><option value="PRISON">Prison</option><option value="OTHER">Other</option></Select>}</Field>
          <Field label="Date">{(c) => <DateInput {...c} value={visitDate} onChange={setVisitDate} max={todayISO()} />}</Field>
        </div>
        <Field label="What happened" required error={fieldError('summary')}>{(c) => <Textarea {...c} rows={5} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
        <Field label="Follow up on" hint="Optional.">{(c) => <DateInput {...c} value={followUpOn} onChange={setFollowUpOn} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={memberId === null || summary.trim().length < 2}>Save visit</Button><Button to="/care" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
