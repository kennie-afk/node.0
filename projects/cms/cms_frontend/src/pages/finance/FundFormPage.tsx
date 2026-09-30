import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, PageLoader, Select, Textarea, useQuery } from '../../ui';
import { createFund, listFunds, updateFund, type Fund, type Restriction } from '../../api/financeApi';
import { invalidateLookups } from '../../features/finance/components/lookups';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

/** Loads the fund (when editing), then mounts the form with it as its starting values. */
export default function FundFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const all = useQuery(() => listFunds(true), [], { enabled: id !== null });
  if (id !== null && !all.data) return <PageLoader />;
  return <FundForm key={id ?? 'new'} id={id} current={all.data?.find((f) => f.id === id)} />;
}

function FundForm({ id, current }: { id: number | null; current: Fund | undefined }) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [code, setCode] = useState(current?.code ?? '');
  const [name, setName] = useState(current?.name ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [restriction, setRestriction] = useState<Restriction>(current?.restriction ?? 'UNRESTRICTED');
  const [isActive, setActive] = useState(current?.isActive ?? true);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() => (id ? updateFund(id, { name, description: description || null, restriction, isActive }) : createFund({ code, name, description: description || null, restriction })), 'Fund saved');
    if (saved) { invalidateLookups('funds'); navigate('/finance/funds'); }
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit fund' : 'New fund'} crumbs={[{ label: 'Funds', to: '/finance/funds' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Code" required hint="Short and permanent, e.g. BLD">{(c) => <Input {...c} value={code} disabled={!!id} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />}</Field>
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
            <Field label="Restriction" hint="Restricted funds cannot be overspent. Cannot change once the fund has postings.">
              {(c) => <Select {...c} value={restriction} onChange={(e) => setRestriction(e.target.value as Restriction)}><option value="UNRESTRICTED">Unrestricted</option><option value="TEMPORARILY_RESTRICTED">Temporarily restricted</option><option value="PERMANENTLY_RESTRICTED">Permanently restricted</option></Select>}
            </Field>
            <Field label="Description">{(c) => <Textarea {...c} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
          </div>
          {id && <label className="ui-row"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Active (a fund must be empty before it is deactivated)</label>}
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={!name || (!id && code.length < 2)}>Save</Button><Button to="/finance/funds" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
