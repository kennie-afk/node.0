import { useState } from 'react';
import { Button, Card, DataTable, Field, FilterBar, formatDateTime, Input, LoadMore, PageHeader, StatusPill, useKeysetList, useToast } from '../../ui';
import { getIntegrity, type AuditEvent, type IntegrityReport } from '../../api/financeApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function AuditPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState('');
  const list = useKeysetList<AuditEvent>('/finance/audit', { action: action || undefined }, { enabled: can('audit:read') });
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true);
    try { setReport(await getIntegrity()); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  if (!can('audit:read')) {
    return <div className="ui-page ui-stack"><PageHeader title="Audit & integrity" /><SectionTabs section="ledger" active="/finance/audit" /><p className="fin-muted">The audit trail is available to administrators and auditors.</p></div>;
  }
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Audit & integrity" subtitle="A tamper-evident record: every entry and event is chained to the one before it" actions={<Button variant="primary" size="sm" loading={busy} onClick={verify}>Verify the books now</Button>} />
      <SectionTabs section="ledger" active="/finance/audit" />
      {report && (
        <Card title="Verification result" actions={<StatusPill status={report.ok ? 'All checks passed' : 'Problems found'} tone={report.ok ? 'ok' : 'bad'} />}>
          <p>Ledger: {report.ledger.entries} entries and {report.ledger.lines} lines re-hashed, balances recomputed from the journal — <strong>{report.ledger.ok ? 'intact' : 'PROBLEMS'}</strong>.</p>
          <p>Audit trail: {report.audit.events} events re-hashed — <strong>{report.audit.ok ? 'intact' : 'PROBLEMS'}</strong>.</p>
          {[...report.ledger.issues, ...report.audit.issues].length > 0 && <ul className="fin-form-error">{[...report.ledger.issues, ...report.audit.issues].map((i) => <li key={i}>{i}</li>)}</ul>}
        </Card>
      )}
      <FilterBar><Field label="Action contains">{(c) => <Input {...c} value={action} placeholder="e.g. period.close" onChange={(e) => setAction(e.target.value)} />}</Field></FilterBar>
      <DataTable<AuditEvent>
        rowKey={(e) => e.seq}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        columns={[
          { key: 'seq', header: '#', numeric: true, render: (e) => e.seq },
          { key: 'time', header: 'When', render: (e) => formatDateTime(e.occurredAt) },
          { key: 'action', header: 'Action', render: (e) => e.action },
          { key: 'entity', header: 'Record', render: (e) => `${e.entityType}${e.entityId ? ` #${e.entityId}` : ''}` },
          { key: 'actor', header: 'By', render: (e) => (e.actorId ? `user ${e.actorId}` : 'system') },
          { key: 'data', header: 'Detail', render: (e) => <span className="fin-muted">{JSON.stringify(e.data).slice(0, 80)}</span> }
        ]}
        empty={<span>No audit events yet.</span>}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="events" />}
      />
    </div>
  );
}
