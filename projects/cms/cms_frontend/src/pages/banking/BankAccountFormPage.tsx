import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, MoneyInput, PageHeader, Select } from '../../ui';
import { createBankAccount, type BankKind } from '../../api/bankingApi';
import { invalidateLookups } from '../../features/finance/components/lookups';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function BankAccountFormPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BankKind>('BANK');
  const [code, setCode] = useState('');
  const [accountNumber, setNumber] = useState('');
  const [float, setFloat] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() => createBankAccount({ name, kind, newAccount: { code, name }, accountNumber: accountNumber || null, float: float || null }), 'Account created');
    if (saved) { invalidateLookups('bank-accounts', 'accounts', 'accounts-all'); navigate(`/banking/accounts/${saved.id}`); }
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New cash or bank account" crumbs={[{ label: 'Accounts', to: '/banking/accounts' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
            <Field label="Kind" required>{(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as BankKind)}><option value="BANK">Bank account</option><option value="CASH">Cash</option><option value="MPESA_PAYBILL">M-Pesa paybill</option><option value="MPESA_TILL">M-Pesa till</option><option value="PETTY_CASH">Petty cash</option></Select>}</Field>
            <Field label="Ledger account code" required hint="A new asset account with this code is created for it">{(c) => <Input {...c} value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="e.g. 1120" />}</Field>
            <Field label="Account number">{(c) => <Input {...c} value={accountNumber} onChange={(e) => setNumber(e.target.value)} maxLength={40} />}</Field>
            {kind === 'PETTY_CASH' && <Field label="Float" hint="The amount petty cash is topped up to">{(c) => <MoneyInput {...c} value={float} onChange={setFloat} />}</Field>}
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!name || !code}>Create account</Button><Button to="/banking/accounts" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
