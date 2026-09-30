import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, ErrorState, Field, Input, PageHeader, PageLoader, Select, sumMoney, todayISO, useQuery } from '../../ui';
import { getRun, remitRun } from '../../api/payrollApi';
import { BankAccountSelect } from '../../features/finance/components/Selectors';
import { FormError, KeyValue, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useBankAccounts } from '../../features/finance/components/lookups';

const KINDS = [['PAYE', 'PAYE (KRA)'], ['NSSF', 'NSSF'], ['SHIF', 'SHIF (SHA)'], ['HOUSING_LEVY', 'Affordable housing levy']] as const;

export default function RunRemitPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const banks = useBankAccounts();
  const { data: run, error, refetch } = useQuery(() => getRun(id), [id]);
  const [kind, setKind] = useState<'PAYE' | 'NSSF' | 'SHIF' | 'HOUSING_LEVY'>('PAYE');
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  if (error && !run) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!run) return <PageLoader />;
  const amount = {
    PAYE: run.totals.paye,
    NSSF: sumMoney([run.totals.nssfEmployee, run.totals.nssfEmployer]),
    SHIF: run.totals.shif,
    HOUSING_LEVY: sumMoney([run.totals.housingLevyEmployee, run.totals.housingLevyEmployer])
  }[kind];
  const done = new Set(run.remittances.map((r) => r.kind));
  const account = banks.data?.find((b) => b.id === bankId);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await submit.run((key) => remitRun(id, { kind, date, accountId: account?.glAccountId, reference: reference || undefined }, key), 'Remittance recorded');
    if (ok) navigate(`/payroll/runs/${id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Remit a statutory deduction" subtitle="Records the payment to the authority; nothing is sent from here" crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }, { label: 'Run', to: `/payroll/runs/${id}` }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Deduction" required>{(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{KINDS.map(([k, label]) => <option key={k} value={k} disabled={done.has(k)}>{label}{done.has(k) ? ' (already remitted)' : ''}</option>)}</Select>}</Field>
            <Field label="Paid from" required>{(c) => <BankAccountSelect {...c} value={bankId} onChange={setBankId} />}</Field>
            <Field label="Date paid" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Reference" hint="Payment slip or M-Pesa code">{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}</Field>
          </div>
          <KeyValue items={[['Amount to remit', <Money key="a" value={amount} strong />], ['Includes the employer’s share', kind === 'NSSF' || kind === 'HOUSING_LEVY' ? 'Yes' : 'No']]} />
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!bankId || done.has(kind)}>Record remittance</Button><Button to={`/payroll/runs/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
