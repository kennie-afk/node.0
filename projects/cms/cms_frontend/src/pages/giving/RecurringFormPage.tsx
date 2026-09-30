import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, MoneyInput, PageHeader, Select, todayISO, type ComboOption } from '../../ui';
import { createRecurring } from '../../api/givingApi';
import { FundSelect, GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { PAYMENT_METHODS } from '../../features/finance/components/helpers';

export default function RecurringFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [method, setMethod] = useState('M-Pesa');
  const [startDate, setStart] = useState(todayISO());
  const [endDate, setEnd] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() => createRecurring({ memberId: member!.value, givingTypeId: typeId!, fundId, amount, frequency, paymentMethod: method, startDate, endDate: endDate || null }), 'Schedule created');
    if (saved) navigate('/giving/recurring');
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New recurring gift" crumbs={[{ label: 'Recurring gifts', to: '/giving/recurring' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Member" required>{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
            <Field label="Giving type" required>{(c) => <GivingTypeSelect {...c} value={typeId} onChange={setTypeId} />}</Field>
            <Field label="Fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="Type default" value={fundId} onChange={setFundId} />}</Field>
            <Field label="Amount" required>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Every">{(c) => <Select {...c} value={frequency} onChange={(e) => setFrequency(e.target.value)}>{['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'].map((f) => <option key={f} value={f}>{f.toLowerCase()}</option>)}</Select>}</Field>
            <Field label="Payment method">{(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
            <Field label="Starts" required>{(c) => <DateInput {...c} value={startDate} onChange={setStart} />}</Field>
            <Field label="Ends">{(c) => <DateInput {...c} value={endDate} onChange={setEnd} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!member || !typeId || !amount}>Create schedule</Button><Button to="/giving/recurring" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
