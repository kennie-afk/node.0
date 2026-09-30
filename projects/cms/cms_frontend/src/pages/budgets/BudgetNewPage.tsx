import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useQuery } from '../../ui';
import { createBudget } from '../../api/budgetsApi';
import { listFiscalYears } from '../../api/financeApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function BudgetNewPage() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const years = useQuery(() => listFiscalYears(), []);
  const [yearId, setYearId] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const b = await submit.run(() => createBudget({ fiscalYearId: Number(yearId), name, notes: notes || null }), 'Budget created');
    if (b) navigate(`/budgets/${b.id}`);
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="New budget" subtitle="Start empty, then fill the grid; or copy last year’s from its budget page" crumbs={[{ label: 'Budgets', to: '/budgets' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Fiscal year" required>{(c) => <Select {...c} value={yearId} onChange={(e) => setYearId(e.target.value)}><option value="">Choose…</option>{(years.data ?? []).filter((y) => y.status === 'OPEN').map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>}</Field>
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. 2027 operating budget" />}</Field>
            <Field label="Notes">{(c) => <Textarea {...c} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}</Field>
          </div>
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!yearId || name.trim().length < 2}>Create</Button><Button to="/budgets" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
