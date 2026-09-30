import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery, Field, Select, FilterBar } from '../../ui';
import { listAccounts, type Account } from '../../api/financeApi';
import { useAuth } from '../../context/auth-context';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;

/** The chart of accounts as an indented tree, sorted by code. */
export default function AccountsPage() {
  const { can } = useAuth();
  const [type, setType] = useState('');
  const [inactive, setInactive] = useState(false);
  const { data, error, loading, refetch } = useQuery(() => listAccounts({ type: type || undefined, includeInactive: inactive }), [type, inactive]);

  const rows = useMemo(() => {
    const all = data ?? [];
    const byId = new Map(all.map((a) => [a.id, a]));
    const depth = (a: Account): number => {
      let d = 0;
      let cur = a;
      while (cur.parentId && byId.has(cur.parentId) && d < 6) {
        cur = byId.get(cur.parentId)!;
        d += 1;
      }
      return d;
    };
    return all.map((a) => ({ account: a, depth: depth(a) }));
  }, [data]);

  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Chart of accounts" subtitle="Headings group accounts; only accounts you can post to appear on forms" actions={can('finance:post') && <Button to="/finance/accounts/new" variant="primary" size="sm">New account</Button>} />
      <SectionTabs section="ledger" active="/finance/accounts" />
      <FilterBar>
        <Field label="Type">{(c) => <Select {...c} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}</Select>}</Field>
        <label className="ui-row"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive</label>
      </FilterBar>
      <DataTable
        rowKey={(r) => r.account.id}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refetch}
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="ui-num">{r.account.code}</span> },
          {
            key: 'name', header: 'Account',
            render: (r) => (
              <span style={{ paddingLeft: r.depth * 14, fontWeight: r.account.isPostable ? 400 : 600 }}>
                {r.account.isPostable ? <Link to={`/finance/accounts/${r.account.id}/register`}>{r.account.name}</Link> : r.account.name}
              </span>
            )
          },
          { key: 'type', header: 'Type', render: (r) => r.account.type.toLowerCase() },
          { key: 'key', header: 'Used by', render: (r) => (r.account.systemKey ? <StatusPill status={r.account.systemKey.replace(/_/g, ' ').toLowerCase()} tone="info" /> : '') },
          { key: 'status', header: 'Status', render: (r) => (r.account.isActive ? (r.account.isPostable ? '' : 'heading') : <StatusPill status="Inactive" tone="neutral" />) },
          { key: 'edit', header: '', render: (r) => can('finance:post') && <Button size="sm" variant="ghost" to={`/finance/accounts/${r.account.id}/edit`}>Edit</Button> }
        ]}
        empty={<EmptyState title="No accounts" message="The standard chart is created automatically for a new church." />}
      />
    </div>
  );
}
