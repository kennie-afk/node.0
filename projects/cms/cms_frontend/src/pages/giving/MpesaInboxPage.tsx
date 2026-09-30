import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, DataTable, EmptyState, Field, FilterBar, formatDateTime, LoadMore, MoneyInput, PageHeader, Select, StatusPill, useKeysetList, useQuery, useToast, Input } from '../../ui';
import { getMpesaConfig, retryReceipt, simulateC2b, type MpesaReceipt } from '../../api/mpesaApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { FormError, KeyValue, Money } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function MpesaInboxPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('UNALLOCATED');
  const list = useKeysetList<MpesaReceipt>('/mpesa/transactions', { status });
  const config = useQuery(() => getMpesaConfig(), [], { enabled: can('giving:write') });
  const sim = useSubmit();
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [billRef, setBillRef] = useState('');
  const mock = config.data?.mode === 'mock';

  const simulate = async () => {
    const r = await sim.run(() => simulateC2b({ amount, msisdn: phone || undefined, billRef: billRef || undefined }), 'Simulated payment received');
    if (r) { setAmount(''); list.refresh(); }
  };
  const retry = async (id: number) => {
    try { await retryReceipt(id); toast.success('Retried'); list.refresh(); } catch (f) { toast.error(normalizeError(f).message); }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title="M-Pesa inbox" subtitle="Payments that reached the paybill, matched to members or waiting to be allocated" actions={can('giving:write') && <Button to="/giving/mpesa/stk" size="sm">Request a payment (STK push)</Button>} />
      <SectionTabs section="giving" active="/giving/mpesa" />
      {config.data && (
        <Card title="Connection">
          <KeyValue items={[['Mode', <StatusPill key="m" status={config.data.mode} tone={config.data.mode === 'mock' ? 'warn' : 'ok'} />], ['Callbacks configured', config.data.configured ? 'Yes' : 'No: MPESA_CALLBACK_SECRET is not set'], ['Confirmation URL', config.data.c2bConfirmationUrl ?? '-']]} />
          {mock && <p className="fin-warn" style={{ marginTop: 8 }}>Mock mode: no money moves and Safaricom is never called. Use the panel below to play a customer paying.</p>}
        </Card>
      )}
      {mock && can('giving:write') && (
        <Card title="Simulate a customer payment">
          <form className="ui-form" onSubmit={(e) => { e.preventDefault(); void simulate(); }} aria-label="Simulate a payment">
            <div className="ui-form-grid">
              <Field label="Amount" required>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
              <Field label="Phone" hint="254712345678; matches a member by phone">{(c) => <Input {...c} value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
              <Field label="Account reference" hint="M12 matches member 12; or a type word such as TITHE">{(c) => <Input {...c} value={billRef} onChange={(e) => setBillRef(e.target.value)} />}</Field>
            </div>
            <FormError error={sim.error} />
            <div className="ui-form-actions"><Button type="submit" loading={sim.loading} disabled={!amount}>Send simulated payment</Button></div>
          </form>
        </Card>
      )}
      <FilterBar><Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="UNALLOCATED">Waiting to be allocated</option><option value="MATCHED">Matched automatically</option><option value="ALLOCATED">Allocated by hand</option><option value="ERROR">Errors</option></Select>}</Field></FilterBar>
      <DataTable<MpesaReceipt>
        rowKey={(r) => r.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        columns={[
          { key: 'time', header: 'Received', render: (r) => formatDateTime(r.transTime) },
          { key: 'code', header: 'M-Pesa code', render: (r) => r.transId },
          { key: 'from', header: 'From', render: (r) => r.payerName ?? r.msisdn ?? '-' },
          { key: 'ref', header: 'Reference', render: (r) => r.billRef ?? '-' },
          { key: 'amount', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> },
          { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          {
            key: 'act', header: '',
            render: (r) => can('giving:write') && (
              <span className="ui-row">
                {r.status === 'UNALLOCATED' && <Button size="sm" variant="primary" to={`/giving/mpesa/${r.id}/allocate`}>Allocate</Button>}
                {r.status === 'ERROR' && <Button size="sm" onClick={() => retry(r.id)}>Retry</Button>}
                {r.contributionId && <Link to={`/giving/contributions/${r.contributionId}`}>Gift</Link>}
              </span>
            )
          }
        ]}
        empty={<EmptyState title="Nothing here" message={status === 'UNALLOCATED' ? 'Every payment has been matched to a member.' : 'No M-Pesa payments match this filter.'} />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="payments" />}
      />
      {list.error && <p className="fin-warn" role="alert">{list.error.message}</p>}
    </div>
  );
}
