import { useState } from 'react';
import { Badge, Button, Card, DataTable, EmptyState, Field, PageHeader, formatDateTime, useQuery, type Column } from '../../ui';
import { listConsents, type Consent } from '../../api/dataopsApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MemberPicker } from '../../features/ops/components/pickers';
import { CHANNEL_LABEL, consentKey, latestConsents, PURPOSE_LABEL } from '../../features/ops/lib/consent';
import { DataTabs } from './DataTabs';

export default function ConsentsPage() {
  const [memberId, setMemberId] = useState<number | null>(null);
  const consents = useQuery(() => listConsents(memberId!), [memberId], { enabled: memberId !== null });
  const { can } = useAuth();
  const current = consents.data ? [...latestConsents(consents.data).values()] : [];
  const columns: Array<Column<Consent>> = [
    { key: 'purpose', header: 'Purpose', render: (c) => PURPOSE_LABEL[c.purpose] },
    { key: 'channel', header: 'Channel', render: (c) => CHANNEL_LABEL[c.channel] },
    { key: 'granted', header: 'Choice', render: (c) => <Badge tone={c.granted ? 'ok' : 'bad'}>{c.granted ? 'Agreed' : 'Not agreed'}</Badge> },
    { key: 'source', header: 'How recorded', render: (c) => c.source.toLowerCase() },
    { key: 'when', header: 'When', render: (c) => formatDateTime(c.recordedAt) },
    { key: 'notes', header: 'Note', render: (c) => c.notes ?? '' }
  ];
  void consentKey;
  return (
    <OpsPage>
      <PageHeader title="Consent records" subtitle="What each member has agreed to, and when. The newest record for each purpose is their current choice." actions={memberId && can('members:write') ? <Button to={`/data/consents/${memberId}/new`} variant="primary">Record a choice</Button> : undefined} />
      <DataTabs active="consents" />
      <div style={{ maxWidth: 360 }}><Field label="Member">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field></div>
      {memberId === null ? <EmptyState title="Choose a member" message="Search for a member to see their consent history." /> : (
        <>
          {current.length > 0 && <Card title="Current choices"><ul className="ops-list">{current.map((c) => <li key={c.id}><span>{PURPOSE_LABEL[c.purpose]} <span className="ops-muted">· {CHANNEL_LABEL[c.channel]}</span></span><Badge tone={c.granted ? 'ok' : 'bad'}>{c.granted ? 'Agreed' : 'Not agreed'}</Badge></li>)}</ul></Card>}
          <Card title="Full history" flush><DataTable columns={columns} rows={[...(consents.data ?? [])].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())} rowKey={(c) => c.id} loading={consents.loading} error={consents.error} onRetry={consents.refetch} empty={<EmptyState title="Nothing recorded" message="No consent has been recorded for this member yet." />} /></Card>
        </>
      )}
    </OpsPage>
  );
}
