import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataTable, Field, FilterBar, monthLabel, PageHeader, Select, StatusPill, useQuery } from '../../ui';
import { getStatutorySummary } from '../../api/payrollApi';
import { Money, PrintButton } from '../../features/finance/components/common';
import { yearsBack } from '../../features/finance/components/helpers';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function StatutoryPage() {
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { data, error, loading, refetch } = useQuery(() => getStatutorySummary(year), [year]);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Statutory deductions" subtitle="What is owed to KRA, NSSF, SHA and the housing levy, month by month" actions={<PrintButton />} />
      <SectionTabs section="payroll" active="/payroll/statutory" />
      <FilterBar><Field label="Year">{(c) => <Select {...c} value={year} onChange={(e) => setYear(Number(e.target.value))}>{yearsBack().map((y) => <option key={y}>{y}</option>)}</Select>}</Field></FilterBar>
      <Card flush>
        <DataTable
          rowKey={(m) => m.runId}
          rows={data?.months ?? []}
          loading={loading}
          error={error}
          onRetry={refetch}
          rowHref={(m) => `/payroll/runs/${m.runId}`}
          columns={[
            { key: 'month', header: 'Month', render: (m) => monthLabel(m.month) },
            { key: 'status', header: 'Run', render: (m) => <StatusPill status={m.status} /> },
            { key: 'gross', header: 'Gross', numeric: true, render: (m) => <Money value={m.gross} /> },
            { key: 'paye', header: 'PAYE', numeric: true, render: (m) => <Money value={m.paye} /> },
            { key: 'nssf', header: 'NSSF', numeric: true, render: (m) => <Money value={m.nssf} /> },
            { key: 'shif', header: 'SHIF', numeric: true, render: (m) => <Money value={m.shif} /> },
            { key: 'ahl', header: 'Housing levy', numeric: true, render: (m) => <Money value={m.housingLevy} /> },
            { key: 'rem', header: 'Remitted', render: (m) => `${m.remittedKinds} of 4` }
          ]}
          totals={data && <tr><td colSpan={2}>Year total</td><td className="ui-num"><Money value={data.totals.gross} strong /></td><td className="ui-num"><Money value={data.totals.paye} strong /></td><td className="ui-num"><Money value={data.totals.nssf} strong /></td><td className="ui-num"><Money value={data.totals.shif} strong /></td><td className="ui-num"><Money value={data.totals.housingLevy} strong /></td><td /></tr>}
          empty={<span>No pay runs in {year}.</span>}
        />
      </Card>
      <p className="fin-muted">Figures use the statutory rates on the <Link to="/payroll/rates">rates page</Link>, where each figure says whether it came from an official source.</p>
    </div>
  );
}
