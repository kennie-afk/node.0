import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, DateInput, EmptyState, Field, FilterBar, formatDate, LoadMore, PageHeader, SearchInput, StatusPill, Tabs, useKeysetList } from '../../ui';
import type { BillSummary } from '../../api/payablesApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

const STATUS_TABS = [
  { key: '', label: 'All' }, { key: 'DRAFT', label: 'Drafts' }, { key: 'SUBMITTED', label: 'To approve' }, { key: 'APPROVED', label: 'To pay' },
  { key: 'PARTIALLY_PAID', label: 'Part paid' }, { key: 'PAID', label: 'Paid' }, { key: 'VOID', label: 'Void' }
];

export default function BillsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const list = useKeysetList<BillSummary>('/payables/bills', { status, q, from, to, overdue: overdue ? 'true' : undefined });
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Bills"
        subtitle="Supplier bills and expense claims, from draft to paid"
        actions={can('finance:post') && <div className="ui-row"><Button to="/payables/claims/new" size="sm">Expense claim</Button><Button to="/payables/bills/new" variant="primary" size="sm">New bill</Button></div>}
      />
      <SectionTabs section="payables" active="/payables/bills" />
      <Tabs tabs={STATUS_TABS} active={status} onChange={setStatus} label="Bill status" />
      <FilterBar>
        <SearchInput onSearch={setQ} placeholder="Vendor, reference or note" />
        <Field label="Billed from">{(c) => <DateInput {...c} value={from} onChange={setFrom} />}</Field>
        <Field label="Billed to">{(c) => <DateInput {...c} value={to} onChange={setTo} />}</Field>
        <label className="ui-row"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue only</label>
      </FilterBar>
      <DataTable<BillSummary>
        rowKey={(b) => b.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(b) => `/payables/bills/${b.id}`}
        columns={[
          { key: 'no', header: 'No.', numeric: true, render: (b) => b.billNo },
          { key: 'vendor', header: 'Vendor', render: (b) => <span>{b.vendorName}{b.kind === 'EXPENSE_CLAIM' && <> <StatusPill status="Claim" tone="info" /></>}</span> },
          { key: 'ref', header: 'Reference', render: (b) => b.reference ?? '-' },
          { key: 'date', header: 'Billed', render: (b) => formatDate(b.billDate) },
          { key: 'due', header: 'Due', render: (b) => formatDate(b.dueDate) },
          { key: 'total', header: 'Total', numeric: true, render: (b) => <Money value={b.total} /> },
          { key: 'out', header: 'Owed', numeric: true, render: (b) => <Money value={b.outstanding} strong={b.outstanding !== '0.00'} /> },
          { key: 'status', header: 'Status', render: (b) => <StatusPill status={b.status} /> }
        ]}
        empty={<EmptyState title="No bills" message="Record a bill when a supplier invoices you; it is approved, then paid." action={can('finance:post') ? <Link to="/payables/bills/new">New bill</Link> : undefined} />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="bills" />}
      />
    </div>
  );
}
