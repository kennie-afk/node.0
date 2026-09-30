import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, todayISO } from '../../ui';
import { postTransfer } from '../../api/financeApi';
import { FundSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function TransferFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [date, setDate] = useState(todayISO());
  const [fromFundId, setFrom] = useState<number | null>(null);
  const [toFundId, setTo] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entry = await submit.run((key) => postTransfer({ date, fromFundId: fromFundId!, toFundId: toFundId!, amount, memo }, key), 'Transfer posted');
    if (entry) navigate(`/finance/journal/${entry.id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Transfer between funds" subtitle="Moves net assets from one fund to another. The money itself does not move." crumbs={[{ label: 'Funds', to: '/finance/funds' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="From fund" required>{(c) => <FundSelect {...c} value={fromFundId} onChange={setFrom} />}</Field>
            <Field label="To fund" required>{(c) => <FundSelect {...c} value={toFundId} onChange={setTo} />}</Field>
            <Field label="Amount" required error={submit.error?.fieldMessage('amount')}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Date" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Reason" required>{(c) => <Input {...c} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />}</Field>
          </div>
          <p className="fin-muted">A restricted fund cannot be overdrawn: the ledger refuses a transfer larger than the fund holds.</p>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!fromFundId || !toFundId || fromFundId === toFundId || !amount || memo.length < 3}>Post transfer</Button><Button to="/finance/funds" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
