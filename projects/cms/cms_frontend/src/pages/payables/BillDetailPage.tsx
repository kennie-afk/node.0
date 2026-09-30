import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDate, formatDateTime, InlineConfirm, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { approveBill, deleteBill, getBill, rejectBill, submitBill, voidBill, voidPayment, type Bill, type BillPayment } from '../../api/payablesApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, ReasonAction } from '../../features/finance/components/common';

const STEPS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'];

export default function BillDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const { data: bill, error, refetch } = useQuery(() => getBill(id), [id]);
  const [busy, setBusy] = useState(false);
  if (error && !bill) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!bill) return <PageLoader />;

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast.success(done); refetch(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  const write = can('finance:post');
  const approve = can('finance:approve');
  const approvalsNeeded = bill.requiredApprovals - bill.approvals.length;
  const stepIndex = bill.status === 'PARTIALLY_PAID' ? 2 : Math.max(0, STEPS.indexOf(bill.status));

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`${bill.kind === 'EXPENSE_CLAIM' ? 'Expense claim' : 'Bill'} #${bill.billNo} · ${bill.vendorName}`}
        subtitle={bill.memo ?? undefined}
        crumbs={[{ label: 'Bills', to: '/payables/bills' }]}
        actions={<StatusPill status={bill.status} />}
      />
      {bill.status !== 'VOID' && (
        <ol className="fin-stepper" aria-label="Progress">
          {STEPS.map((s, i) => <li key={s} className={`fin-step ${i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}`}>{s === 'SUBMITTED' ? 'Submitted' : s === 'APPROVED' ? 'Approved' : s.charAt(0) + s.slice(1).toLowerCase()}</li>)}
        </ol>
      )}
      {bill.warnings.length > 0 && <div className="fin-warn" role="alert">{bill.warnings.map((w) => <div key={w}>{w}</div>)}</div>}
      {bill.rejectedReason && <div className="fin-warn">Rejected: {bill.rejectedReason}. Edit it and submit again.</div>}
      {bill.voidReason && <div className="fin-warn">Voided: {bill.voidReason}</div>}

      <Card title="Actions">
        <div className="ui-row">
          {bill.status === 'DRAFT' && write && (
            <>
              <Button variant="primary" loading={busy} onClick={() => act(() => submitBill(id), 'Submitted for approval')}>Submit for approval</Button>
              <Button to={`/payables/bills/${id}/edit`}>Edit</Button>
              <InlineConfirm label="Delete draft" question="Delete this draft?" onConfirm={async () => { try { await deleteBill(id); toast.success('Draft deleted'); navigate('/payables/bills'); } catch (f) { toast.error(normalizeError(f).message); } }} />
            </>
          )}
          {bill.status === 'SUBMITTED' && approve && (
            <>
              <Button variant="primary" loading={busy} onClick={() => act(() => approveBill(id), approvalsNeeded > 1 ? 'Your approval is recorded; a second approver is still needed' : 'Approved and posted to the ledger')}>Approve</Button>
              <ReasonAction label="Reject" question="Why is it rejected?" confirmLabel="Reject" onConfirm={(reason) => act(() => rejectBill(id, reason), 'Rejected')} />
            </>
          )}
          {bill.status === 'SUBMITTED' && !approve && <span className="fin-muted">Waiting for {approvalsNeeded} approval{approvalsNeeded === 1 ? '' : 's'} from someone with approval rights.</span>}
          {(bill.status === 'APPROVED' || bill.status === 'PARTIALLY_PAID') && write && <Button variant="primary" to={`/payables/bills/${id}/pay`}>Record a payment</Button>}
          {!['VOID', 'PAID'].includes(bill.status) && write && bill.status !== 'DRAFT' && bill.payments.every((p) => p.status === 'VOID') && (
            <ReasonAction label="Void bill" question="Why void this bill?" confirmLabel="Void bill" onConfirm={(reason) => act(() => voidBill(id, reason), 'Bill voided and its ledger entry reversed')} />
          )}
        </div>
        {bill.status === 'SUBMITTED' && <p className="fin-muted" style={{ marginTop: 8 }}>The person who prepared or submitted a bill cannot approve it{bill.requiredApprovals > 1 ? `; this amount needs ${bill.requiredApprovals} different approvers` : ''}. The server enforces that.</p>}
      </Card>

      <Card title="Bill">
        <KeyValue items={[
          ['Vendor', bill.vendorName], ['Reference', bill.reference ?? '-'], ['Billed', formatDate(bill.billDate)], ['Due', formatDate(bill.dueDate)],
          ['Total', <Money key="t" value={bill.total} strong />], ['Paid', <Money key="p" value={bill.paid} />], ['Owed', <Money key="o" value={bill.outstanding} strong />],
          ['Approvals', `${bill.approvals.length} of ${bill.requiredApprovals}`], ['Ledger entry', bill.journalEntryId ? <Link key="j" to={`/finance/journal/${bill.journalEntryId}`}>View entry</Link> : 'not posted yet']
        ]} />
      </Card>

      <Card title="Lines" flush>
        <DataTable rowKey={(l) => l.lineNo} rows={bill.lines} columns={[
          { key: 'acct', header: 'Account', render: (l) => `${l.accountCode} · ${l.accountName}` },
          { key: 'fund', header: 'Fund', render: (l) => l.fundCode },
          { key: 'desc', header: 'Description', render: (l) => l.description ?? '' },
          { key: 'amt', header: 'Amount', numeric: true, render: (l) => <Money value={l.amount} /> }
        ]} />
      </Card>

      {bill.approvals.length > 0 && (
        <Card title="Approval trail" flush>
          <DataTable rowKey={(a) => a.approverId + a.approvedAt} rows={bill.approvals} columns={[
            { key: 'who', header: 'Approved by', render: (a) => (a.auto ? 'Automatic (below the threshold)' : `User ${a.approverId}`) },
            { key: 'when', header: 'When', render: (a) => formatDateTime(a.approvedAt) }
          ]} />
        </Card>
      )}

      <Card title="Payments" flush>
        <DataTable<BillPayment>
          rowKey={(p) => p.id}
          rows={bill.payments}
          columns={[
            { key: 'date', header: 'Paid', render: (p) => formatDate(p.paidDate) },
            { key: 'ref', header: 'Reference', render: (p) => p.reference ?? '-' },
            { key: 'amt', header: 'Amount', numeric: true, render: (p) => <Money value={p.amount} /> },
            { key: 'status', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
            { key: 'je', header: 'Entry', render: (p) => (p.journalEntryId ? <Link to={`/finance/journal/${p.journalEntryId}`}>#{p.journalEntryId}</Link> : '') },
            { key: 'act', header: '', render: (p) => write && p.status === 'POSTED' && <ReasonAction label="Void payment" question="Why void this payment?" confirmLabel="Void" onConfirm={(reason) => act(() => voidPayment(id, p.id, reason), 'Payment voided')} /> }
          ]}
          empty={<span>No payments yet.</span>}
        />
      </Card>
    </div>
  );
}

export type { Bill };
