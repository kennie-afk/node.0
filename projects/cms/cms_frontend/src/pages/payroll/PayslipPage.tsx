import { useParams } from 'react-router-dom';
import { Card, DataTable, ErrorState, formatMoney, PageHeader, PageLoader, useQuery } from '../../ui';
import { getPayslip } from '../../api/payrollApi';
import { DownloadPdfButton, KeyValue, Money, PrintButton } from '../../features/finance/components/common';
import type { PdfDoc } from '../../features/finance/components/pdfDoc';
import type { Payslip } from '../../api/payrollApi';

const m = (amount: string) => formatMoney(amount);

/** The payslip as a PDF: the same figures the screen shows, laid out for filing. */
function payslipDoc(s: Payslip): PdfDoc {
  return {
    filename: `payslip-${s.employee.name.replace(/\s+/g, '-').toLowerCase()}-${s.period.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    org: s.employer,
    title: 'Payslip',
    subtitle: s.period,
    sections: [
      { heading: 'Employee', rows: [['Name', s.employee.name], ['Job title', s.employee.jobTitle ?? '-'], ['KRA PIN', s.employee.kraPin ?? '-'], ['NSSF no.', s.employee.nssfNo ?? '-'], ['SHIF no.', s.employee.shifNo ?? '-'], ['Period ends', s.periodEnd], ['Paid by', s.payMethod.toLowerCase()]] },
      { heading: 'Earnings', rows: s.earnings.map((r) => [r.label, m(r.amount)] as [string, string]), total: ['Gross pay', m(s.gross)] },
      { heading: 'Deductions', rows: s.deductions.map((r) => [r.label, m(r.amount)] as [string, string]), total: ['Net pay', m(s.net)] },
      { heading: 'How PAYE was worked out', rows: [['Taxable pay', m(s.taxComputation.taxablePay)], ['Tax before relief', m(s.taxComputation.taxBeforeRelief)], ['Personal relief', m(s.taxComputation.personalRelief)], ['Insurance relief', m(s.taxComputation.insuranceRelief)]], total: ['PAYE', m(s.taxComputation.paye)] },
      { heading: 'Employer contributions (not deducted from pay)', rows: s.employerContributions.map((r) => [r.label, m(r.amount)] as [string, string]) },
      { heading: 'Year to date', rows: [['Gross', m(s.yearToDate.gross)], ['PAYE', m(s.yearToDate.paye)], ['NSSF', m(s.yearToDate.nssf)], ['SHIF', m(s.yearToDate.shif)], ['Housing levy', m(s.yearToDate.housingLevy)]], total: ['Net', m(s.yearToDate.net)] }
    ],
    footer: s.runStatus === 'PAID' || s.runStatus === 'POSTED' ? 'Confidential: for the named employee only.' : `Draft: this run is ${s.runStatus.toLowerCase()} and figures may change.`
  };
}

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
      <PageHeader title={`Payslip · ${s.period}`} subtitle={s.employer} crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }, { label: 'Run', to: `/payroll/runs/${runId}` }]} actions={<div className="ui-row no-print"><PrintButton /><DownloadPdfButton build={() => payslipDoc(s)} /></div>} />
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
