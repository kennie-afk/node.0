import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDate, monthLabel, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { approveRun, calculateRun, getRun, postRun, reopenRun, voidRun, type RunDetail, type RunPayslip, type RunStatus } from '../../api/payrollApi';
import { downloadCsv } from '../../api/reportsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, ReasonAction } from '../../features/finance/components/common';

const STEPS: RunStatus[] = ['DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'PAID'];
const LABEL: Record<string, string> = { DRAFT: 'Draft', CALCULATED: 'Calculated', APPROVED: 'Approved', POSTED: 'Posted to the ledger', PAID: 'Paid' };

export default function RunDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: run, error, refetch } = useQuery(() => getRun(id), [id]);
  const [busy, setBusy] = useState(false);
  if (error && !run) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!run) return <PageLoader />;

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast.success(done); refetch(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); }
  };
  const download = async (path: string, name: string) => { try { await downloadCsv(path, {}, name); } catch (f) { toast.error(normalizeError(f).message); } };
  const current = STEPS.indexOf(run.status as RunStatus);
  const remitted = new Set(run.remittances.map((r) => r.kind));
  const run_ = can('payroll:run');
  const approve = can('payroll:approve');

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Pay run · ${monthLabel(run.month)} ${run.year}`} subtitle={`Statutory rates version ${run.rateVersion}`} crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }]} actions={<StatusPill status={run.status} />} />
      {run.status !== 'VOID' && (
        <ol className="fin-stepper" aria-label="Pay run progress">
          {STEPS.map((s, i) => <li key={s} className={`fin-step ${i < current ? 'done' : i === current ? 'current' : ''}`}>{LABEL[s]}</li>)}
        </ol>
      )}
      {run.voidReason && <div className="fin-warn">Voided: {run.voidReason}</div>}

      <Card title="What to do next">
        <div className="ui-row">
          {run.status === 'DRAFT' && run_ && <Button variant="primary" loading={busy} onClick={() => act(() => calculateRun(id), 'Calculated from each employee’s current pay')}>Calculate pay</Button>}
          {run.status === 'CALCULATED' && run_ && <Button loading={busy} onClick={() => act(() => calculateRun(id), 'Recalculated')}>Recalculate</Button>}
          {run.status === 'CALCULATED' && approve && <Button variant="primary" loading={busy} onClick={() => act(() => approveRun(id), 'Approved')}>Approve</Button>}
          {run.status === 'CALCULATED' && !approve && <span className="fin-muted">Waiting for a different person with approval rights to approve this run. The person who prepared it cannot.</span>}
          {['CALCULATED', 'APPROVED'].includes(run.status) && run_ && <Button variant="ghost" loading={busy} onClick={() => act(() => reopenRun(id), 'Reopened as a draft')}>Reopen as draft</Button>}
          {run.status === 'APPROVED' && run_ && <Button variant="primary" loading={busy} onClick={() => act(() => postRun(id), 'Posted to the ledger')}>Post to the ledger</Button>}
          {run.status === 'POSTED' && run_ && <Button variant="primary" to={`/payroll/runs/${id}/pay`}>Record salaries paid</Button>}
          {['POSTED', 'PAID'].includes(run.status) && run_ && <Button to={`/payroll/runs/${id}/remit`}>Remit statutory deductions</Button>}
          {['POSTED', 'PAID'].includes(run.status) && approve && (
            <ReasonAction label="Void run" question="Why void this run? Its ledger entries are reversed." confirmLabel="Void run" onConfirm={(reason) => act(() => voidRun(id, reason), 'Run voided and its ledger entries reversed')} />
          )}
          {run.status === 'DRAFT' && <span className="fin-muted">Calculating uses each active employee’s current salary, allowances and deductions.</span>}
        </div>
      </Card>

      <Card title="Totals">
        <KeyValue items={[
          ['Employees', run.employeeCount], ['Gross pay', <Money key="g" value={run.totals.gross} strong />], ['PAYE', <Money key="p" value={run.totals.paye} />],
          ['NSSF (employee)', <Money key="n" value={run.totals.nssfEmployee} />], ['SHIF', <Money key="s" value={run.totals.shif} />], ['Housing levy (employee)', <Money key="h" value={run.totals.housingLevyEmployee} />],
          ['Other deductions', <Money key="o" value={run.totals.otherDeductions} />], ['Advance recovery', <Money key="a" value={run.totals.advanceRecovery} />], ['Net pay', <Money key="net" value={run.totals.net} strong />],
          ['Employer NSSF', <Money key="en" value={run.totals.nssfEmployer} />], ['Employer housing levy', <Money key="eh" value={run.totals.housingLevyEmployer} />],
          ['Approved', run.approvedAt ? formatDate(run.approvedAt.slice(0, 10)) : '-'], ['Paid', run.paidDate ? formatDate(run.paidDate) : '-'],
          ['Ledger entries', <span key="le">{run.postedEntryId ? <Link to={`/finance/journal/${run.postedEntryId}`}>posted</Link> : 'not posted'}{run.paidEntryId && <> · <Link to={`/finance/journal/${run.paidEntryId}`}>payment</Link></>}</span>]
        ]} />
        <div className="ui-row" style={{ marginTop: 8 }}>
          <Button size="sm" onClick={() => download(`/payroll/runs/${id}/register.csv`, `payroll-register-${run.year}-${run.month}.csv`)}>Payroll register (CSV)</Button>
          {run_ && <Button size="sm" onClick={() => download(`/payroll/runs/${id}/payment-file.csv`, `payment-file-${run.year}-${run.month}.csv`)}>Payment file (CSV)</Button>}
          <Button size="sm" onClick={() => download(`/payroll/runs/${id}/statutory.csv`, `statutory-${run.year}-${run.month}.csv`)}>Statutory return (CSV)</Button>
        </div>
      </Card>

      <Card title="Statutory remittances" subtitle="Due by the 9th of next month">
        <DataTable
          rowKey={(k) => k}
          rows={(['PAYE', 'NSSF', 'SHIF', 'HOUSING_LEVY'] as const).map((k) => k)}
          columns={[
            { key: 'kind', header: 'Deduction', render: (k) => k.replace('_', ' ').toLowerCase() },
            { key: 'status', header: 'Status', render: (k) => <StatusPill status={remitted.has(k) ? 'Remitted' : run.status === 'POSTED' || run.status === 'PAID' ? 'Due' : 'Not yet'} tone={remitted.has(k) ? 'ok' : 'neutral'} /> },
            { key: 'amt', header: 'Amount', numeric: true, render: (k) => { const r = run.remittances.find((x) => x.kind === k); return r ? <Money value={r.amount} /> : ''; } },
            { key: 'date', header: 'Paid', render: (k) => { const r = run.remittances.find((x) => x.kind === k); return r ? formatDate(r.paidDate) : ''; } }
          ]}
        />
      </Card>

      <Card title="Payslips" flush>
        <DataTable<RunPayslip>
          rowKey={(p) => p.id}
          rows={(run as RunDetail).payslips}
          rowHref={(p) => `/payroll/runs/${id}/payslips/${p.employeeId}`}
          columns={[
            { key: 'name', header: 'Employee', render: (p) => p.employeeName },
            { key: 'gross', header: 'Gross', numeric: true, render: (p) => <Money value={p.gross} /> },
            { key: 'paye', header: 'PAYE', numeric: true, render: (p) => <Money value={p.paye} /> },
            { key: 'nssf', header: 'NSSF', numeric: true, render: (p) => <Money value={p.nssfEmployee} /> },
            { key: 'shif', header: 'SHIF', numeric: true, render: (p) => <Money value={p.shif} /> },
            { key: 'ahl', header: 'Levy', numeric: true, render: (p) => <Money value={p.housingLevyEmployee} /> },
            { key: 'net', header: 'Net', numeric: true, render: (p) => <Money value={p.net} strong /> }
          ]}
          empty={<span>Nothing calculated yet.</span>}
        />
      </Card>
    </div>
  );
}
