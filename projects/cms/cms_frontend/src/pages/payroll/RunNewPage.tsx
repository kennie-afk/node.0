import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, monthLabel, PageHeader, Select } from '../../ui';
import { createRun } from '../../api/payrollApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import { yearsBack } from '../../features/finance/components/helpers';

export default function RunNewPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const now = new Date();
  const [year, setYear] = useState(String(now.getUTCFullYear()));
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const run = await submit.run(() => createRun({ year: Number(year), month: Number(month) }), 'Pay run created');
    if (run) navigate(`/payroll/runs/${run.id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New pay run" crumbs={[{ label: 'Pay runs', to: '/payroll/runs' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Month" required>{(c) => <Select {...c} value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthLabel(i + 1)}</option>)}</Select>}</Field>
            <Field label="Year" required>{(c) => <Select {...c} value={year} onChange={(e) => setYear(e.target.value)}>{yearsBack(3).map((y) => <option key={y}>{y}</option>)}</Select>}</Field>
          </div>
          <p className="fin-muted">Only one live run is allowed per month. A voided run frees the month.</p>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading}>Create run</Button><Button to="/payroll/runs" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
