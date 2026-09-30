import { Link } from 'react-router-dom';
import { Button, Card, DataTable, formatDate, PageHeader, StatusPill, useQuery, useToast } from '../../ui';
import { closePeriod, listFiscalYears, reopenPeriod, type FiscalYear, type Period } from '../../api/financeApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { ReasonAction } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { InlineConfirm } from '../../ui';

export default function PeriodsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, refetch } = useQuery(() => listFiscalYears(), []);
  const act = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); toast.success(done); refetch(); } catch (f) { toast.error(normalizeError(f).message); }
  };
  const monthsClosed = (y: FiscalYear) => y.periods.filter((p) => p.number <= 12 && p.status !== 'OPEN').length;

  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Fiscal periods" subtitle="Close a month once it is reconciled; nothing can then be posted into it" />
      <SectionTabs section="ledger" active="/finance/periods" />
      {error && !data && <p className="fin-warn" role="alert">{error.message} <Button size="sm" variant="ghost" onClick={refetch}>Retry</Button></p>}
      {loading && !data && <Card>Loading periods…</Card>}
      {(data ?? []).map((year) => (
        <Card
          key={year.id}
          title={year.name}
          subtitle={`${formatDate(year.startDate)} – ${formatDate(year.endDate)} · ${monthsClosed(year)} of 12 months closed`}
          actions={
            <span className="ui-row">
              <StatusPill status={year.status} />
              {can('finance:close') && year.status === 'OPEN' && <Button size="sm" variant="secondary" to={`/finance/periods/close-year/${year.id}`}>Close the year…</Button>}
            </span>
          }
          flush
        >
          <DataTable<Period>
            rowKey={(p) => p.id}
            rows={year.periods}
            columns={[
              { key: 'name', header: 'Period', render: (p) => (p.number === 13 ? <span className="fin-muted">{p.name} (year-end entries)</span> : p.name) },
              { key: 'range', header: 'Dates', render: (p) => `${formatDate(p.startDate)} – ${formatDate(p.endDate)}` },
              { key: 'status', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
              {
                key: 'act', header: '',
                render: (p) => {
                  if (p.number === 13) return null;
                  return (
                    <span className="ui-row">
                      {p.status === 'OPEN' && can('finance:close') && <InlineConfirm label="Close month" question={`Close ${p.name}?`} confirmLabel="Close" variant="secondary" onConfirm={() => act(() => closePeriod(p.id), `${p.name} closed`)} />}
                      {p.status === 'CLOSED' && can('finance:settings') && <ReasonAction label="Reopen" variant="secondary" question="Why reopen this month?" minLength={5} onConfirm={(reason) => act(() => reopenPeriod(p.id, reason), `${p.name} reopened`)} />}
                      {p.status === 'LOCKED' && <span className="fin-muted">locked with the year</span>}
                    </span>
                  );
                }
              }
            ]}
          />
        </Card>
      ))}
      <p className="fin-muted">Months close in order. Reopening needs a reason, is written to the audit trail, and is refused once the year is closed. <Link to="/finance/audit">See the audit trail</Link>.</p>
    </div>
  );
}
