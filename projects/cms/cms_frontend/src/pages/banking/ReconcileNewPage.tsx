import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, MoneyInput, PageHeader, todayISO } from '../../ui';
import { openReconciliation } from '../../api/bankingApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function ReconcileNewPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const [statementDate, setDate] = useState(todayISO());
  const [statementBalance, setBalance] = useState('');
  const [openingBalance, setOpening] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await submit.run(() => openReconciliation(id, { statementDate, statementBalance, openingBalance: openingBalance || undefined }), 'Reconciliation started');
    if (r) navigate(`/banking/reconciliations/${r.id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Start a reconciliation" subtitle="Compare the bank’s closing balance with your books" crumbs={[{ label: 'Accounts', to: '/banking/accounts' }, { label: 'Account', to: `/banking/accounts/${id}` }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Statement date" required>{(c) => <DateInput {...c} value={statementDate} onChange={setDate} />}</Field>
            <Field label="Closing balance on the statement" required>{(c) => <MoneyInput {...c} value={statementBalance} onChange={setBalance} />}</Field>
            <Field label="Opening balance" hint="Only for the very first reconciliation of this account">{(c) => <MoneyInput {...c} value={openingBalance} onChange={setOpening} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!statementBalance}>Start</Button><Button to={`/banking/accounts/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
