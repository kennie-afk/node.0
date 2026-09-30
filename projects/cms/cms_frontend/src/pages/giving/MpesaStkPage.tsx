import { useState, type FormEvent } from 'react';
import { Button, Card, DataTable, Field, formatDateTime, Input, MoneyInput, PageHeader, StatusPill, useQuery, type ComboOption } from '../../ui';
import { listStkRequests, simulateStkResult, stkPush } from '../../api/mpesaApi';
import { FormError, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { GivingTypeSelect, MemberPicker } from '../../features/finance/components/Selectors';
import { fromMinor } from '../../ui';
import { useAuth } from '../../context/auth-context';

export default function MpesaStkPage() {
  const { can } = useAuth();
  const submit = useSubmit();
  const simulate = useSubmit();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const requests = useQuery(() => listStkRequests(), []);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await submit.run(() => stkPush({ memberId: member?.value, phone: phone || undefined, amount, givingTypeId: typeId ?? undefined }), 'Prompt sent to the phone');
    if (r) { setAmount(''); requests.refetch(); }
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Request a payment" subtitle="Sends an M-Pesa prompt to the giver’s phone" crumbs={[{ label: 'M-Pesa inbox', to: '/giving/mpesa' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Member">{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
            <Field label="Or phone number" hint="Used when no member is chosen">{(c) => <Input {...c} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" />}</Field>
            <Field label="Amount" required>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
            <Field label="Giving type">{(c) => <GivingTypeSelect {...c} allowEmpty emptyLabel="Default" value={typeId} onChange={setTypeId} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!amount || (!member && !phone)}>Send prompt</Button></div>
        </form>
      </Card>
      <Card title="Recent requests" flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={requests.data ?? []}
          loading={requests.loading}
          error={requests.error}
          columns={[
            { key: 'time', header: 'Sent', render: (r) => formatDateTime(r.createdAt) },
            { key: 'phone', header: 'Phone', render: (r) => r.phone },
            { key: 'amount', header: 'Amount', numeric: true, render: (r) => <Money value={fromMinor(r.amountMinor)} /> },
            { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
            { key: 'receipt', header: 'Receipt', render: (r) => r.mpesaReceipt ?? r.resultDesc ?? '-' },
            {
              key: 'sim', header: '',
              render: (r) => can('giving:write') && r.status === 'PENDING' && r.checkoutRequestId && (
                <span className="ui-row">
                  <Button size="sm" loading={simulate.loading} onClick={async () => { await simulate.run(() => simulateStkResult({ checkoutRequestId: r.checkoutRequestId!, success: true }), 'Simulated: customer paid'); requests.refetch(); }}>Simulate paid</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await simulate.run(() => simulateStkResult({ checkoutRequestId: r.checkoutRequestId!, success: false }), 'Simulated: customer declined'); requests.refetch(); }}>Simulate declined</Button>
                </span>
              )
            }
          ]}
          empty={<span>No requests yet.</span>}
        />
        <FormError error={simulate.error} />
      </Card>
    </div>
  );
}
