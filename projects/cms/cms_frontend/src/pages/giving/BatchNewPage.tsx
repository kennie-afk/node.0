import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, PageHeader, todayISO } from '../../ui';
import { createBatch } from '../../api/givingApi';
import { BankAccountSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function BatchNewPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [name, setName] = useState(`Sunday service ${todayISO()}`);
  const [serviceDate, setDate] = useState(todayISO());
  const [depositId, setDepositId] = useState<number | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const batch = await submit.run(() => createBatch({ name, serviceDate, depositAccountId: depositId }), 'Batch opened');
    if (batch) navigate(`/giving/batches/${batch.id}/entry`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Open a counting batch" crumbs={[{ label: 'Counting batches', to: '/giving/batches' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}</Field>
            <Field label="Service date" required>{(c) => <DateInput {...c} value={serviceDate} onChange={setDate} />}</Field>
            <Field label="Deposit into" hint="Usually cash on hand or the bank">{(c) => <BankAccountSelect {...c} allowEmpty emptyLabel="Cash on hand" value={depositId} onChange={setDepositId} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={submit.loading}>Open batch</Button>
            <Button to="/giving/batches" variant="ghost">Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
