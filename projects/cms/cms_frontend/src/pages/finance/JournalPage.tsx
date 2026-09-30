import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, DateInput, EmptyState, Field, FilterBar, formatDate, LoadMore, PageHeader, SearchInput, Select, useKeysetList } from '../../ui';
import type { JournalSummary } from '../../api/financeApi';
import { useAuth } from '../../context/auth-context';
import { Money, ReversedFlag, SourcePill } from '../../features/finance/components/common';
import { AccountSelect, FundSelect } from '../../features/finance/components/Selectors';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

const SOURCES = ['MANUAL', 'CONTRIBUTION', 'MPESA', 'BILL', 'BILL_PAYMENT', 'PAYROLL', 'PAYROLL_PAY', 'PAYROLL_REMIT', 'PETTY_CASH', 'TRANSFER', 'REVERSAL', 'CLOSING'];

export default function JournalPage() {
  const { can } = useAuth();
  const [f, setF] = useState({ from: '', to: '', sourceType: '', accountId: '', fundId: '', q: '' });
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const list = useKeysetList<JournalSummary>('/finance/journal', f);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Journal" subtitle="Every posting, newest first. Entries are never edited; a mistake is reversed." actions={can('finance:post') && <div className="ui-row"><Button to="/finance/transfers/new" size="sm">Fund transfer</Button><Button to="/finance/journal/new" variant="primary" size="sm">New entry</Button></div>} />
      <SectionTabs section="ledger" active="/finance/journal" />
      <FilterBar>
        <SearchInput onSearch={(q) => set({ q })} placeholder="Search descriptions" />
        <Field label="From">{(c) => <DateInput {...c} value={f.from} onChange={(v) => set({ from: v })} />}</Field>
        <Field label="To">{(c) => <DateInput {...c} value={f.to} onChange={(v) => set({ to: v })} />}</Field>
        <Field label="Source">{(c) => <Select {...c} value={f.sourceType} onChange={(e) => set({ sourceType: e.target.value })}><option value="">Any</option>{SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}</Select>}</Field>
        <Field label="Account">{(c) => <AccountSelect {...c} allowEmpty value={f.accountId ? Number(f.accountId) : ''} onChange={(v) => set({ accountId: v ? String(v) : '' })} />}</Field>
        <Field label="Fund">{(c) => <FundSelect {...c} allowEmpty value={f.fundId ? Number(f.fundId) : ''} onChange={(v) => set({ fundId: v ? String(v) : '' })} />}</Field>
      </FilterBar>
      <DataTable<JournalSummary>
        rowKey={(e) => e.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(e) => `/finance/journal/${e.id}`}
        columns={[
          { key: 'no', header: '#', numeric: true, render: (e) => e.entryNo },
          { key: 'date', header: 'Date', render: (e) => formatDate(e.entryDate) },
          { key: 'memo', header: 'Description', render: (e) => <span>{e.memo} <ReversedFlag reversed={e.reversedByEntryId !== null} /></span> },
          { key: 'src', header: 'Source', render: (e) => <SourcePill source={e.sourceType} /> },
          { key: 'total', header: 'Amount', numeric: true, render: (e) => <Money value={e.total} /> }
        ]}
        empty={<EmptyState title="No entries match" message="Gifts, bills and payroll post here automatically; add a manual entry for anything else." action={can('finance:post') ? <Link to="/finance/journal/new">New entry</Link> : undefined} />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="entries" />}
      />
    </div>
  );
}
