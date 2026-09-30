import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { closeFiscalYear, getTrialBalance, listFiscalYears } from '../../api/financeApi';
import { getIncomeStatement } from '../../api/reportsApi';
import { normalizeError } from '../../api/http';
import { Money } from '../../features/finance/components/common';

/** Year-end close as a short wizard: check, review the result that will move to net assets, confirm. */
export default function CloseYearPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const years = useQuery(() => listFiscalYears(), []);
  const year = years.data?.find((y) => y.id === id);
  const summary = useQuery(() => getIncomeStatement({ from: year!.startDate, to: year!.endDate }), [year?.id], { enabled: !!year });
  const tb = useQuery(() => getTrialBalance({ asOf: year!.endDate }), [year?.id], { enabled: !!year });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; closingEntryId: number | null } | null>(null);

  if (years.error && !years.data) return <div className="ui-page"><ErrorState message={years.error.message} onRetry={years.refetch} /></div>;
  if (!years.data) return <PageLoader />;
  if (!year) return <div className="ui-page"><ErrorState message="That fiscal year was not found." /></div>;

  const open = year.periods.filter((p) => p.number <= 12 && p.status === 'OPEN');
  const ready = open.length === 0 && year.status === 'OPEN';

  const close = async () => {
    setBusy(true);
    try {
      const r = await closeFiscalYear(id);
      toast.success(`${r.name} closed`);
      setDone({ name: r.name, closingEntryId: r.closingEntryId });
    } catch (f) {
      toast.error(normalizeError(f).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="ui-page ui-stack">
        <PageHeader title={`${done.name} is closed`} crumbs={[{ label: 'Fiscal periods', to: '/finance/periods' }]} />
        <Card>
          <p className="fin-ok">Income and expenses were moved into net assets and every period of the year is now locked. The next fiscal year has been opened.</p>
          <p style={{ marginTop: 8 }}>{done.closingEntryId && <Link to={`/finance/journal/${done.closingEntryId}`}>View the closing entry</Link>} · <Link to="/reports/balance-sheet">Balance sheet</Link></p>
          <Button onClick={() => navigate('/finance/periods')} style={{ marginTop: 8 }}>Back to periods</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Close ${year.name}`} subtitle="This cannot be undone" crumbs={[{ label: 'Fiscal periods', to: '/finance/periods' }]} />
      <Card title="1 · Every month is closed">
        {open.length === 0 ? <p className="fin-ok">All twelve months are closed.</p> : <p className="fin-warn">Still open: {open.map((p) => p.name).join(', ')}. <Link to="/finance/periods">Close them first</Link>.</p>}
      </Card>
      <Card title="2 · The year’s result that will move to net assets">
        {summary.data ? (
          <p>
            Income <Money value={summary.data.totalIncome} strong /> · Spending <Money value={summary.data.totalExpenses} strong /> · {summary.data.surplus.startsWith('-') ? 'Deficit' : 'Surplus'} <Money value={summary.data.surplus} strong />
          </p>
        ) : <p className="fin-muted">Loading the result…</p>}
        {tb.data && <p>Trial balance at year end: <StatusPill status={tb.data.balanced ? 'Balanced' : 'Out of balance'} tone={tb.data.balanced ? 'ok' : 'bad'} /> <Link to={`/reports/balance-sheet?asOf=${year.endDate}`}>Review the balance sheet</Link></p>}
      </Card>
      <Card title="3 · Confirm">
        <p>Closing posts one entry per fund that zeroes income and expense into net assets, locks all periods, and opens the next year.</p>
        <div className="ui-row" style={{ marginTop: 8 }}>
          <Button variant="dangerSolid" loading={busy} disabled={!ready} onClick={close}>Close {year.name}</Button>
          <Button to="/finance/periods" variant="ghost">Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
