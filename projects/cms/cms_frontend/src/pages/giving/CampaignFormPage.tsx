import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, Select, Textarea, todayISO } from '../../ui';
import { createCampaign, getCampaign, updateCampaign } from '../../api/givingApi';
import { FundSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function CampaignFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const navigate = useNavigate();
  const submit = useSubmit();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStart] = useState(todayISO());
  const [endDate, setEnd] = useState('');
  const [fundId, setFundId] = useState<number | null>(null);
  const [status, setStatus] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE');

  useEffect(() => {
    if (!id) return;
    getCampaign(id).then((c) => { setName(c.name); setDescription(c.description ?? ''); setGoal(c.goal); setStart(c.startDate); setEnd(c.endDate ?? ''); setFundId(c.fundId); setStatus(c.status); });
  }, [id]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() =>
      id
        ? updateCampaign(id, { name, description: description || null, goal: goal || undefined, endDate: endDate || null, status, fundId })
        : createCampaign({ name, description: description || null, goal: goal || undefined, startDate, endDate: endDate || null, fundId }),
      'Campaign saved');
    if (saved) navigate(`/giving/campaigns/${saved.id}`);
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit campaign' : 'New campaign'} crumbs={[{ label: 'Campaigns', to: '/giving/campaigns' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}</Field>
            <Field label="Goal">{(c) => <MoneyInput {...c} value={goal} onChange={setGoal} />}</Field>
            <Field label="Starts" required>{(c) => <DateInput {...c} value={startDate} onChange={setStart} />}</Field>
            <Field label="Ends" hint="Optional">{(c) => <DateInput {...c} value={endDate} onChange={setEnd} />}</Field>
            <Field label="Restricted to fund" hint="Gifts to this campaign are tagged to this fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="Not restricted" value={fundId} onChange={setFundId} />}</Field>
            {id && <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'CLOSED')}><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option></Select>}</Field>}
            <Field label="Description">{(c) => <Textarea {...c} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!name}>Save</Button><Button to="/giving/campaigns" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
