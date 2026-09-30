import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, ErrorState, Field, Input, PageHeader, PageLoader, todayISO, useQuery } from '../../ui';
import { getRun, payRun } from '../../api/payrollApi';
import { BankAccountSelect } from '../../features/finance/components/Selectors';
import { FormError, KeyValue, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useBankAccounts } from '../../features/finance/components/lookups';

export default function RunPayPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const banks = useBankAccounts();
  const { data: run, error, refetch } = useQuery(() => getRun(id), [id]);
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  if (error && !run) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!run) return <PageLoader />;
  const account = banks.data?.find((b) => b.id === bankId);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const done = await submit.run((key) => payRun(id, { date, accountId: account?.glAccountId, reference: reference || undefined }, key), 'Salaries recorded as paid');
    if (done) navigate(`/payroll/runs/${id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Record salaries paid" crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }, { label: 'Run', to: `/payroll/runs/${id}` }]} />
      <Card><KeyValue items={[['Net pay to employees', <Money key="n" value={run.totals.net} strong />], ['Employees', run.employeeCount]]} /><p className="fin-muted">This records that you have already paid (or are paying) the salaries out of the chosen account. No money is sent from here; download the payment file from the run page for your bank.</p></Card>
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Paid from" required>{(c) => <BankAccountSelect {...c} value={bankId} onChange={setBankId} />}</Field>
            <Field label="Date paid" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Reference">{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!bankId}>Record as paid</Button><Button to={`/payroll/runs/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
