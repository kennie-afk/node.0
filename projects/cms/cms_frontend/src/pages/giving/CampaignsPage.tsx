import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, Field, FilterBar, formatDate, PageHeader, Select, StatusPill, useQuery } from '../../ui';
import { listCampaigns, type Campaign } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { Money, Progress } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function CampaignsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const { data, error, loading, refetch } = useQuery(() => listCampaigns(status || undefined), [status]);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Campaigns" subtitle="Fundraising goals with pledges and gifts tracked against them" actions={can('giving:write') && <Button to="/giving/campaigns/new" variant="primary" size="sm">New campaign</Button>} />
      <SectionTabs section="giving" active="/giving/campaigns" />
      <FilterBar><Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option></Select>}</Field></FilterBar>
      <DataTable<Campaign>
        rowKey={(c) => c.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowHref={(c) => `/giving/campaigns/${c.id}`}
        columns={[
          { key: 'name', header: 'Campaign' },
          { key: 'goal', header: 'Goal', numeric: true, render: (c) => <Money value={c.goal} /> },
          { key: 'pledged', header: 'Pledged', numeric: true, render: (c) => <Money value={c.pledged} /> },
          { key: 'raised', header: 'Raised', numeric: true, render: (c) => <Money value={c.raised} /> },
          { key: 'progress', header: 'Progress', render: (c) => <Progress basisPoints={c.progressBasisPoints} tone={c.progressBasisPoints >= 10000 ? 'ok' : undefined} /> },
          { key: 'when', header: 'Runs', render: (c) => `${formatDate(c.startDate)}${c.endDate ? ` – ${formatDate(c.endDate)}` : ''}` },
          { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> }
        ]}
        empty={<EmptyState title="No campaigns" message="Start one for a building project, missions trip or special offering." action={<Link to="/giving/campaigns/new">New campaign</Link>} />}
      />
    </div>
  );
}
