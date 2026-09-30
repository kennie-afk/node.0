import { useState } from 'react';
import { Button, Card, DataTable, EmptyState, formatDate, LoadMore, PageHeader, StatusPill, useKeysetList, useQuery, useToast } from '../../ui';
import { pettyStatus, replenishPetty, voidVoucher, type Voucher } from '../../api/payablesApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, ReasonAction } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { useBankAccounts } from '../../features/finance/components/lookups';

export default function PettyCashPage() {
  const { can } = useAuth();
  const toast = useToast();
  const banks = useBankAccounts();
  const petty = banks.data?.find((b) => b.kind === 'PETTY_CASH');
  const status = useQuery(() => pettyStatus(petty!.id), [petty?.id], { enabled: !!petty });
  const list = useKeysetList<Voucher>('/payables/petty-cash/vouchers', { bankAccountId: petty?.id }, { enabled: !!petty });
  const [busy, setBusy] = useState(false);
  const replenish = async () => {
    setBusy(true);
    try { await replenishPetty(petty!.id, {}); toast.success('Petty cash replenished'); status.refetch(); list.refresh(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Petty cash" subtitle="Small cash spending, one voucher each, topped up to the float" actions={can('finance:post') && <div className="ui-row"><Button size="sm" loading={busy} onClick={replenish} disabled={!petty || status.data?.unreplenishedVouchers === 0}>Replenish</Button><Button to="/payables/petty-cash/new" variant="primary" size="sm">New voucher</Button></div>} />
      <SectionTabs section="payables" active="/payables/petty-cash" />
      {!petty && banks.data && <EmptyState title="No petty cash account" message="Add a bank account of kind Petty cash under Banking to start." />}
      {status.data && (
        <Card title={status.data.bankAccount.name}>
          <KeyValue items={[['In the tin', <Money key="b" value={status.data.balance} strong />], ['Float', status.data.float ? <Money key="f" value={status.data.float} /> : 'not set'], ['Spent, not yet replenished', <Money key="u" value={status.data.unreplenished} />], ['Vouchers waiting', status.data.unreplenishedVouchers], ['Short of float by', status.data.shortfallToFloat ? <Money key="s" value={status.data.shortfallToFloat} /> : '-']]} />
        </Card>
      )}
      <DataTable<Voucher>
        rowKey={(v) => v.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        columns={[
          { key: 'no', header: 'No.', numeric: true, render: (v) => v.voucherNo },
          { key: 'date', header: 'Date', render: (v) => formatDate(v.date) },
          { key: 'payee', header: 'Paid to', render: (v) => v.payee },
          { key: 'memo', header: 'For', render: (v) => v.memo ?? '' },
          { key: 'amt', header: 'Amount', numeric: true, render: (v) => <Money value={v.amount} /> },
          { key: 'status', header: 'Status', render: (v) => <StatusPill status={v.status} /> },
          { key: 'act', header: '', render: (v) => can('finance:post') && v.status === 'POSTED' && <ReasonAction label="Void" question="Why void this voucher?" confirmLabel="Void" onConfirm={async (reason) => { try { await voidVoucher(v.id, reason); toast.success('Voucher voided'); list.refresh(); status.refetch(); } catch (f) { toast.error(normalizeError(f).message); } }} /> }
        ]}
        empty={<EmptyState title="No vouchers" message="Record each small cash spend as a voucher." />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="vouchers" />}
      />
    </div>
  );
}
