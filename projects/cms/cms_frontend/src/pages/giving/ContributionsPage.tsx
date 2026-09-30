import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, DateInput, EmptyState, Field, FilterBar, formatDate, LoadMore, PageHeader, Select, SearchInput, StatusPill, useKeysetList } from '../../ui';
import type { Gift } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { FundSelect, GivingTypeSelect } from '../../features/finance/components/Selectors';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { useGivingTypes } from '../../features/finance/components/lookups';

export default function ContributionsPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState({ status: '', from: '', to: '', typeId: '', fundId: '', q: '' });
  const types = useGivingTypes();
  const typeName = types.data?.find((t) => String(t.id) === filters.typeId)?.name;
  const list = useKeysetList<Gift>('/giving/contributions', { status: filters.status, from: filters.from, to: filters.to, type: typeName, fundId: filters.fundId, q: filters.q });
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Gifts"
        subtitle="Every gift is posted to the ledger with a receipt number"
        actions={can('giving:write') && <Button to="/giving/contributions/new" variant="primary" size="sm">Record a gift</Button>}
      />
      <SectionTabs section="giving" active="/giving/contributions" />
      <FilterBar>
        <SearchInput onSearch={(q) => set({ q })} placeholder="Donor, receipt or reference" />
        <Field label="Status">
          {(c) => (
            <Select {...c} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="POSTED">Posted</option>
              <option value="PENDING">Pending (in a batch)</option>
              <option value="VOID">Void</option>
            </Select>
          )}
        </Field>
        <Field label="Type">{(c) => <GivingTypeSelect {...c} allowEmpty value={filters.typeId ? Number(filters.typeId) : ''} onChange={(v) => set({ typeId: v ? String(v) : '' })} />}</Field>
        <Field label="Fund">{(c) => <FundSelect {...c} allowEmpty value={filters.fundId ? Number(filters.fundId) : ''} onChange={(v) => set({ fundId: v ? String(v) : '' })} />}</Field>
        <Field label="From">{(c) => <DateInput {...c} value={filters.from} onChange={(v) => set({ from: v })} />}</Field>
        <Field label="To">{(c) => <DateInput {...c} value={filters.to} onChange={(v) => set({ to: v })} />}</Field>
      </FilterBar>
      <DataTable<Gift>
        rowKey={(g) => g.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(g) => `/giving/contributions/${g.id}`}
        columns={[
          { key: 'date', header: 'Date', render: (g) => formatDate(g.date) },
          { key: 'receiptNo', header: 'Receipt', render: (g) => g.receiptNo ?? <span className="fin-muted">not yet</span> },
          { key: 'donor', header: 'Donor', render: (g) => (g.isAnonymous ? 'Anonymous' : g.member ? `${g.member.firstName} ${g.member.lastName}` : g.contributorName ?? '-') },
          { key: 'type', header: 'Type', render: (g) => g.contributionType },
          { key: 'fund', header: 'Fund', render: (g) => g.fundCode ?? '-' },
          { key: 'method', header: 'Method', render: (g) => g.paymentMethod ?? '-' },
          { key: 'amount', header: 'Amount', numeric: true, render: (g) => <Money value={g.amount} /> },
          { key: 'status', header: 'Status', render: (g) => <StatusPill status={g.status} /> }
        ]}
        empty={
          <EmptyState
            title="No gifts match"
            message="Record a gift, or open a counting batch for a service."
            action={can('giving:write') ? <Link to="/giving/contributions/new">Record a gift</Link> : undefined}
          />
        }
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="gifts" />}
      />
    </div>
  );
}
