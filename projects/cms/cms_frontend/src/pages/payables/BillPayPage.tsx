import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, ErrorState, Field, Input, MoneyInput, PageHeader, PageLoader, todayISO, useQuery } from '../../ui';
import { getBill, payBill } from '../../api/payablesApi';
import { BankAccountSelect } from '../../features/finance/components/Selectors';
import { FormError, KeyValue, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function BillPayPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const { data: bill, error, refetch } = useQuery(() => getBill(id), [id]);
  const [amount, setAmount] = useState('');
  const [paidDate, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  if (error && !bill) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!bill) return <PageLoader />;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await submit.run((key) => payBill(id, { amount, paidDate, bankAccountId: bankId ?? undefined, reference: reference || null }, key), 'Payment recorded');
    if (r) navigate(`/payables/bills/${id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Pay bill #${bill.billNo}`} subtitle={bill.vendorName} crumbs={[{ label: 'Bills', to: '/payables/bills' }, { label: `#${bill.billNo}`, to: `/payables/bills/${id}` }]} />
      <Card><KeyValue items={[['Total', <Money key="t" value={bill.total} />], ['Already paid', <Money key="p" value={bill.paid} />], ['Owed', <Money key="o" value={bill.outstanding} strong />]]} /></Card>
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Amount" required hint="A part payment is fine; paying more than is owed is refused" error={submit.error?.fieldMessage('amount')}>
              {(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}
            </Field>
            <Field label="Paid from" required>{(c) => <BankAccountSelect {...c} value={bankId} onChange={setBankId} />}</Field>
            <Field label="Date paid" required>{(c) => <DateInput {...c} value={paidDate} onChange={setDate} />}</Field>
            <Field label="Reference" hint="Cheque number, M-Pesa code…">{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />}</Field>
          </div>
          <div className="ui-row"><Button type="button" size="sm" variant="ghost" onClick={() => setAmount(bill.outstanding)}>Pay the full amount owed</Button></div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!amount || !bankId}>Record payment</Button><Button to={`/payables/bills/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
