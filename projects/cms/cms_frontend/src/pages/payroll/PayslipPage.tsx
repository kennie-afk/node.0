import { useParams } from 'react-router-dom';
import { Card, DataTable, ErrorState, PageHeader, PageLoader, useQuery } from '../../ui';
import { getPayslip } from '../../api/payrollApi';
import { KeyValue, Money, PrintButton } from '../../features/finance/components/common';

/** A payslip to hand over: earnings, deductions, how the tax was worked out, year to date. Prints cleanly. */
export default function PayslipPage() {
  const { id, employeeId } = useParams();
  const runId = Number(id);
  const empId = Number(employeeId);
  const { data: s, error, refetch } = useQuery(() => getPayslip(runId, empId), [runId, empId]);
  if (error && !s) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!s) return <PageLoader />;
  return (
    <div className="ui-page ui-stack fin-doc">
      <PageHeader title={`Payslip · ${s.period}`} subtitle={s.employer} crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }, { label: 'Run', to: `/payroll/runs/${runId}` }]} actions={<PrintButton />} />
      {s.runStatus !== 'PAID' && s.runStatus !== 'POSTED' && <p className="fin-warn no-print">This run is {s.runStatus.toLowerCase()}; figures may still change.</p>}
      <Card>
        <KeyValue items={[['Employee', s.employee.name], ['Job title', s.employee.jobTitle ?? '-'], ['KRA PIN', s.employee.kraPin ?? '-'], ['NSSF no.', s.employee.nssfNo ?? '-'], ['SHIF no.', s.employee.shifNo ?? '-'], ['Period ends', s.periodEnd], ['Paid by', s.payMethod.toLowerCase()]]} />
      </Card>
      <div className="ui-grid" style={{ ['--ui-min' as string]: '280px' }}>
        <Card title="Earnings" flush>
          <DataTable rowKey={(r) => r.label} rows={s.earnings} columns={[{ key: 'l', header: 'Item', render: (r) => r.label }, { key: 'a', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} totals={<tr><td>Gross pay</td><td className="ui-num"><Money value={s.gross} strong /></td></tr>} />
        </Card>
        <Card title="Deductions" flush>
          <DataTable rowKey={(r) => r.label} rows={s.deductions} columns={[{ key: 'l', header: 'Item', render: (r) => r.label }, { key: 'a', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} totals={<tr><td>Net pay</td><td className="ui-num"><Money value={s.net} strong /></td></tr>} />
        </Card>
      </div>
      <Card title="How PAYE was worked out">
        <KeyValue items={[['Taxable pay', <Money key="t" value={s.taxComputation.taxablePay} />], ['Tax before relief', <Money key="b" value={s.taxComputation.taxBeforeRelief} />], ['Personal relief', <Money key="p" value={s.taxComputation.personalRelief} />], ['Insurance relief', <Money key="i" value={s.taxComputation.insuranceRelief} />], ['PAYE', <Money key="paye" value={s.taxComputation.paye} strong />]]} />
      </Card>
      <Card title="Employer contributions (not deducted from pay)" flush>
        <DataTable rowKey={(r) => r.label} rows={s.employerContributions} columns={[{ key: 'l', header: 'Item', render: (r) => r.label }, { key: 'a', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} />
      </Card>
      <Card title="Year to date">
        <KeyValue items={[['Gross', <Money key="g" value={s.yearToDate.gross} />], ['PAYE', <Money key="p" value={s.yearToDate.paye} />], ['NSSF', <Money key="n" value={s.yearToDate.nssf} />], ['SHIF', <Money key="s" value={s.yearToDate.shif} />], ['Housing levy', <Money key="h" value={s.yearToDate.housingLevy} />], ['Net', <Money key="net" value={s.yearToDate.net} strong />]]} />
      </Card>
    </div>
  );
}
