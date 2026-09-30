import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Field, formatDateTime, Input, PageHeader, PageLoader, useQuery, type ComboOption } from '../../ui';
import { allocateReceipt, listMpesaReceipts } from '../../api/mpesaApi';
import { FormError, KeyValue, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { FundSelect, GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';

/** Turns a payment held in Unallocated Receipts into a real gift in the right type, fund and member. */
export default function MpesaAllocatePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data, error, refetch } = useQuery(() => listMpesaReceipts({ status: 'UNALLOCATED' }), []);
  const submit = useSubmit();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const receipt = data?.data.find((r) => r.id === id);
  if (error && !data) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!data) return <PageLoader />;
  if (!receipt) return <div className="ui-page"><ErrorState message="That payment is not waiting for allocation. It may already have been allocated." /></div>;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const done = await submit.run(() => allocateReceipt(id, { memberId: member?.value ?? null, givingTypeId: typeId!, fundId, contributorName: member ? null : name || null }), 'Allocated to a gift');
    if (done) navigate('/giving/mpesa');
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Allocate a payment" crumbs={[{ label: 'M-Pesa inbox', to: '/giving/mpesa' }]} />
      <Card><KeyValue items={[['M-Pesa code', receipt.transId], ['Amount', <Money key="a" value={receipt.amount} strong />], ['From', receipt.payerName ?? receipt.msisdn ?? '-'], ['Reference', receipt.billRef ?? '-'], ['Received', formatDateTime(receipt.transTime)]]} /></Card>
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Member">{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
            {!member && <Field label="Or donor name">{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} />}</Field>}
            <Field label="Giving type" required>{(c) => <GivingTypeSelect {...c} value={typeId} onChange={setTypeId} />}</Field>
            <Field label="Fund" hint="Leave empty to use the type’s fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="Type default" value={fundId} onChange={setFundId} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!typeId}>Allocate</Button><Button to="/giving/mpesa" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
