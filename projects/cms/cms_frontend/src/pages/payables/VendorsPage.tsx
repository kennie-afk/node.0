import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, Field, FilterBar, LoadMore, PageHeader, SearchInput, Select, StatusPill, useKeysetList } from '../../ui';
import type { Vendor } from '../../api/payablesApi';
import { useAuth } from '../../context/auth-context';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function VendorsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const list = useKeysetList<Vendor>('/payables/vendors', { q, kind });
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Vendors" subtitle="Suppliers, staff and members you pay" actions={can('finance:post') && <Button to="/payables/vendors/new" variant="primary" size="sm">New vendor</Button>} />
      <SectionTabs section="payables" active="/payables/vendors" />
      <FilterBar>
        <SearchInput onSearch={setQ} placeholder="Search vendors" />
        <Field label="Kind">{(c) => <Select {...c} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option><option value="VENDOR">Supplier</option><option value="STAFF">Staff</option><option value="MEMBER">Member</option></Select>}</Field>
      </FilterBar>
      <DataTable<Vendor>
        rowKey={(v) => v.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(v) => (can('finance:post') ? `/payables/vendors/${v.id}/edit` : undefined)}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'kind', header: 'Kind', render: (v) => v.kind.toLowerCase() },
          { key: 'pin', header: 'KRA PIN', render: (v) => v.kraPin ?? '-' },
          { key: 'phone', header: 'Phone', render: (v) => v.mpesaNumber ?? v.phone ?? '-' },
          { key: 'bank', header: 'Bank', render: (v) => (v.bankName ? `${v.bankName} ${v.bankAccount ?? ''}` : '-') },
          { key: 'status', header: 'Status', render: (v) => <StatusPill status={v.isActive ? 'Active' : 'Inactive'} tone={v.isActive ? 'ok' : 'neutral'} /> }
        ]}
        empty={<EmptyState title="No vendors" message="Add the suppliers you pay so bills can be recorded against them." action={<Link to="/payables/vendors/new">New vendor</Link>} />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="vendors" />}
      />
    </div>
  );
}
