import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, Field, Input, MoneyInput, PageHeader, PageLoader, Select, StatusPill, useQuery, useToast, type ComboOption } from '../../ui';
import { addBatchItem, getBatch, removeBatchItem } from '../../api/givingApi';
import { normalizeError } from '../../api/http';
import { FormError, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { PAYMENT_METHODS } from '../../features/finance/components/helpers';
import { GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';
import { InlineConfirm } from '../../ui';

/** The data-entry workspace for one batch: a quick-add strip with the running list beneath it. */
export default function BatchEntryPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data: batch, error, refetch } = useQuery(() => getBatch(id), [id]);
  const submit = useSubmit();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [method, setMethod] = useState('Cash');

  if (error && !batch) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!batch) return <PageLoader />;
  const open = batch.status === 'OPEN';

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const item = await submit.run(() => addBatchItem(id, { memberId: member?.value ?? null, contributorName: member ? null : name || null, amount, givingTypeId: typeId ?? undefined, paymentMethod: method }));
    if (item) {
      setMember(null); setName(''); setAmount('');
      refetch();
    }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Enter gifts · ${batch.name}`} crumbs={[{ label: 'Counting batches', to: '/giving/batches' }, { label: `#${batch.batchNo}`, to: `/giving/batches/${id}` }]} actions={<StatusPill status={batch.status} />} />
      {open ? (
        <Card title="Add a gift">
          <form className="ui-form" onSubmit={add} aria-label="Add a gift to the batch">
            <div className="ui-form-grid">
              <Field label="Member">{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
              {!member && <Field label="Or donor name">{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday plate" />}</Field>}
              <Field label="Amount" required error={submit.error?.fieldMessage('amount')}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
              <Field label="Type">{(c) => <GivingTypeSelect {...c} value={typeId} onChange={setTypeId} />}</Field>
              <Field label="Method">{(c) => <Select {...c} value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
            </div>
            <FormError error={submit.error} />
            <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!amount}>Add to batch</Button></div>
          </form>
        </Card>
      ) : (
        <p className="fin-warn">This batch is {batch.status.toLowerCase()}; gifts can only be added while it is open. {batch.status === 'COUNTED' && 'Reopen it from the batch page to change it.'}</p>
      )}
      <Card title={`${batch.items.length} gifts · total ${batch.itemsTotal}`} flush actions={<Button to={`/giving/batches/${id}`} size="sm">Done entering</Button>}>
        <DataTable
          rowKey={(i) => i.id}
          rows={batch.items}
          columns={[
            { key: 'who', header: 'Donor', render: (i) => i.memberName ?? '-' },
            { key: 'type', header: 'Type', render: (i) => i.contributionType },
            { key: 'method', header: 'Method', render: (i) => i.paymentMethod ?? '-' },
            { key: 'amount', header: 'Amount', numeric: true, render: (i) => <Money value={i.amount} /> },
            {
              key: 'x',
              header: '',
              render: (i) =>
                open ? (
                  <InlineConfirm
                    label="Remove"
                    question="Remove this gift?"
                    onConfirm={async () => {
                      try { await removeBatchItem(id, i.id); refetch(); } catch (failure) { toast.error(normalizeError(failure).message); }
                    }}
                  />
                ) : null
            }
          ]}
          empty={<span>No gifts entered yet.</span>}
        />
      </Card>
    </div>
  );
}
