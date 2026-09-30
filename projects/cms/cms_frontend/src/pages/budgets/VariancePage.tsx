import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, DataTable, ErrorState, Field, FilterBar, PageHeader, PageLoader, Select, Tabs, useQuery, monthLabel } from '../../ui';
import { getBudget, getVariance, type VarianceRow } from '../../api/budgetsApi';
import { FundSelect } from '../../features/finance/components/Selectors';
import { Money, PrintButton, Progress } from '../../features/finance/components/common';

const GROUPS = [{ key: 'account', label: 'By account' }, { key: 'fund', label: 'By fund' }, { key: 'ministry', label: 'By ministry' }, { key: 'month', label: 'By month' }];

export default function VariancePage() {
  const id = Number(useParams().id);
  const [groupBy, setGroupBy] = useState('account');
  const [through, setThrough] = useState('');
  const [fundId, setFundId] = useState<number | null>(null);
  const budget = useQuery(() => getBudget(id), [id]);
  const { data, error, loading, refetch } = useQuery(() => getVariance(id, { groupBy, throughMonth: through ? Number(through) : undefined, fundId: fundId ?? undefined }), [id, groupBy, through, fundId]);
  if (error && !data) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!data && loading) return <PageLoader />;
  const pct = (r: VarianceRow) => (r.expense.usedPercent === null || r.expense.usedPercent === undefined ? null : Number(r.expense.usedPercent));
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Actual vs budget" subtitle={budget.data ? `${budget.data.name} · through ${data ? monthLabel(data.throughMonth) : '…'}` : undefined} crumbs={[{ label: 'Budgets', to: '/budgets' }, { label: budget.data?.name ?? 'Budget', to: `/budgets/${id}` }]} actions={<PrintButton />} />
      <Tabs tabs={GROUPS} active={groupBy} onChange={setGroupBy} label="Group by" />
      <div className="no-print"><FilterBar>
        <Field label="Through month">{(c) => <Select {...c} value={through} onChange={(e) => setThrough(e.target.value)}><option value="">Latest</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthLabel(i + 1)}</option>)}</Select>}</Field>
        <Field label="Fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="All funds" value={fundId} onChange={setFundId} />}</Field>
      </FilterBar></div>
      <Card flush>
        <DataTable<VarianceRow>
          rowKey={(r) => r.key}
          rows={data?.rows ?? []}
          loading={loading}
          error={error}
          columns={[
            { key: 'label', header: groupBy === 'account' ? 'Account' : groupBy, render: (r) => (r.code ? `${r.code} · ${r.label}` : r.label) },
            { key: 'ib', header: 'Income budget', numeric: true, render: (r) => <Money value={r.income.budget} muted={r.income.budget === '0.00'} /> },
            { key: 'ia', header: 'Income actual', numeric: true, render: (r) => <Money value={r.income.actual} muted={r.income.actual === '0.00'} /> },
            { key: 'iv', header: 'Variance', numeric: true, render: (r) => <Money value={r.income.variance} muted={r.income.variance === '0.00'} /> },
            { key: 'eb', header: 'Spending budget', numeric: true, render: (r) => <Money value={r.expense.budget} muted={r.expense.budget === '0.00'} /> },
            { key: 'ea', header: 'Spending actual', numeric: true, render: (r) => <Money value={r.expense.actual} muted={r.expense.actual === '0.00'} /> },
            { key: 'ec', header: 'Committed', numeric: true, render: (r) => <Money value={r.expense.committed} muted={r.expense.committed === '0.00'} /> },
            { key: 'er', header: 'Left', numeric: true, render: (r) => <Money value={r.expense.remaining} muted={r.expense.remaining === '0.00'} /> },
            { key: 'used', header: 'Used', render: (r) => (pct(r) === null ? '-' : <span className="ui-row"><Progress basisPoints={Math.round((pct(r) ?? 0) * 100)} tone={(pct(r) ?? 0) > 100 ? 'bad' : undefined} /> <span className="ui-num">{pct(r)}%</span></span>) }
          ]}
          empty={<span>No budget lines or activity to compare.</span>}
        />
      </Card>
      <p className="fin-muted">Committed is what has been submitted for approval but is not yet in the books. A bill that is over budget still goes through; it is flagged, not blocked.</p>
    </div>
  );
}
