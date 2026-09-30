import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, Select, useQuery } from '../../ui';
import { copyBudget, getBudget } from '../../api/budgetsApi';
import { listFiscalYears } from '../../api/financeApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function BudgetCopyPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const submit = useSubmit();
  const source = useQuery(() => getBudget(id), [id]);
  const years = useQuery(() => listFiscalYears(), []);
  const [yearId, setYearId] = useState('');
  const [name, setName] = useState('');
  const [uplift, setUplift] = useState('0');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const b = await submit.run(() => copyBudget(id, { fiscalYearId: Number(yearId), name, upliftPercent: Number(uplift) }), 'Budget copied');
    if (b) navigate(`/budgets/${b.id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Copy a budget forward" subtitle={source.data ? `From ${source.data.name}` : undefined} crumbs={[{ label: 'Budgets', to: '/budgets' }, { label: source.data?.name ?? 'Budget', to: `/budgets/${id}` }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Into fiscal year" required>{(c) => <Select {...c} value={yearId} onChange={(e) => setYearId(e.target.value)}><option value="">Choose…</option>{(years.data ?? []).filter((y) => y.status === 'OPEN').map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>}</Field>
            <Field label="New budget name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
            <Field label="Uplift (%)" hint="Every line is scaled by this; use a negative number to cut">{(c) => <Input {...c} type="number" step="0.5" value={uplift} onChange={(e) => setUplift(e.target.value)} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!yearId || name.trim().length < 2}>Copy</Button><Button to={`/budgets/${id}`} variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
