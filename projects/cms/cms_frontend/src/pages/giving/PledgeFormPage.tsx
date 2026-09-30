import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, Select, Textarea, todayISO, useQuery, type ComboOption } from '../../ui';
import { createPledge, getPledge, listCampaigns, updatePledge } from '../../api/givingApi';
import { GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';
import { memberOption } from '../../features/finance/components/selectorHelpers';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function PledgeFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const submit = useSubmit();
  const campaigns = useQuery(() => listCampaigns('ACTIVE'), []);
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [campaignId, setCampaignId] = useState(params.get('campaignId') ?? '');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [installment, setInstallment] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [startDate, setStart] = useState(todayISO());
  const [endDate, setEnd] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    getPledge(id).then(async (p) => {
      setMember(await memberOption(p.memberId)); setCampaignId(p.campaignId ? String(p.campaignId) : ''); setAmount(p.amount); setInstallment(p.installment ?? '');
      setFrequency(p.frequency); setStart(p.startDate); setEnd(p.endDate ?? ''); setNotes(p.notes ?? '');
    });
  }, [id]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() =>
      id
        ? updatePledge(id, { amount, installment: installment || null, endDate: endDate || null, notes: notes || null })
        : createPledge({ memberId: member!.value, campaignId: campaignId ? Number(campaignId) : null, givingTypeId: typeId, amount, installment: installment || undefined, frequency, startDate, endDate: endDate || null, notes: notes || null }),
      'Pledge saved');
    if (saved) navigate(`/giving/pledges/${saved.id}`);
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit pledge' : 'New pledge'} crumbs={[{ label: 'Pledges', to: '/giving/pledges' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Member" required>{(c) => (id ? <Input {...c} value={member?.label ?? ''} disabled /> : <MemberPicker {...c} value={member} onChange={setMember} />)}</Field>
            <Field label="Campaign">{(c) => <Select {...c} disabled={!!id} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">No campaign</option>{(campaigns.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
            {!id && <Field label="Giving type">{(c) => <GivingTypeSelect {...c} allowEmpty emptyLabel="Any type" value={typeId} onChange={setTypeId} />}</Field>}
            <Field label="Total pledged" required error={submit.error?.fieldMessage('amount')}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Installment" hint="Optional amount per period">{(c) => <MoneyInput {...c} value={installment} onChange={setInstallment} />}</Field>
            {!id && <Field label="Schedule">{(c) => <Select {...c} value={frequency} onChange={(e) => setFrequency(e.target.value)}>{['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'].map((f) => <option key={f} value={f}>{f.replace('_', ' ').toLowerCase()}</option>)}</Select>}</Field>}
            {!id && <Field label="Starts" required>{(c) => <DateInput {...c} value={startDate} onChange={setStart} />}</Field>}
            <Field label="Ends">{(c) => <DateInput {...c} value={endDate} onChange={setEnd} />}</Field>
            <Field label="Notes">{(c) => <Textarea {...c} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!amount || !member}>Save</Button><Button to="/giving/pledges" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
