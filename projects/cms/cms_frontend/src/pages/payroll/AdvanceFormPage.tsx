import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, MoneyInput, PageHeader, Select, todayISO, useKeysetList } from '../../ui';
import { createAdvance, type Employee } from '../../api/payrollApi';
import { BankAccountSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { useBankAccounts } from '../../features/finance/components/lookups';

export default function AdvanceFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const banks = useBankAccounts();
  const employees = useKeysetList<Employee>('/payroll/employees', { status: 'ACTIVE' }, { limit: 200 });
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [recovery, setRecovery] = useState('');
  const [date, setDate] = useState(todayISO());
  const [bankId, setBankId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const account = banks.data?.find((b) => b.id === bankId);
    const done = await submit.run((key) => createAdvance({ employeeId: Number(employeeId), amount, monthlyRecovery: recovery, date, accountId: account?.glAccountId, note: note || null }, key), 'Advance recorded');
    if (done) navigate('/payroll/advances');
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New staff advance" crumbs={[{ label: 'Advances', to: '/payroll/advances' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Employee" required>{(c) => <Select {...c} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Choose…</option>{employees.items.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}</Select>}</Field>
            <Field label="Amount lent" required>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Recovered per month" required hint="Deducted from each pay run until repaid">{(c) => <MoneyInput {...c} value={recovery} onChange={setRecovery} />}</Field>
            <Field label="Paid from">{(c) => <BankAccountSelect {...c} allowEmpty emptyLabel="Main bank account" value={bankId} onChange={setBankId} />}</Field>
            <Field label="Date" required>{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
            <Field label="Note">{(c) => <Input {...c} value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!employeeId || !amount || !recovery}>Record advance</Button><Button to="/payroll/advances" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
