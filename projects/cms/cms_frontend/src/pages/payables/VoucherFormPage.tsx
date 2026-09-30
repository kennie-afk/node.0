import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, todayISO } from '../../ui';
import { createVoucher } from '../../api/payablesApi';
import { AccountSelect, FundSelect, MinistrySelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useBankAccounts } from '../../features/finance/components/lookups';

export default function VoucherFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const banks = useBankAccounts();
  const petty = banks.data?.find((b) => b.kind === 'PETTY_CASH');
  const [date, setDate] = useState(todayISO());
  const [payee, setPayee] = useState('');
  const [memo, setMemo] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [ministryId, setMinistryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = await submit.run(() => createVoucher({ bankAccountId: petty!.id, date, payee, memo: memo || null, accountId: accountId!, fundId: fundId!, ministryId, amount }), 'Voucher recorded');
    if (v) navigate('/payables/petty-cash');
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Petty cash voucher" crumbs={[{ label: 'Petty cash', to: '/payables/petty-cash' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Date" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Paid to" required>{(c) => <Input {...c} value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={150} />}</Field>
            <Field label="For">{(c) => <Input {...c} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />}</Field>
            <Field label="Expense account" required>{(c) => <AccountSelect {...c} types={['EXPENSE']} value={accountId} onChange={setAccountId} />}</Field>
            <Field label="Fund" required>{(c) => <FundSelect {...c} value={fundId} onChange={setFundId} />}</Field>
            <Field label="Ministry">{(c) => <MinistrySelect {...c} value={ministryId} onChange={setMinistryId} />}</Field>
            <Field label="Amount" required hint="Cannot be more than the petty cash balance" error={submit.error?.fieldMessage('amount')}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!petty || !payee || !accountId || !fundId || !amount}>Record voucher</Button><Button to="/payables/petty-cash" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
