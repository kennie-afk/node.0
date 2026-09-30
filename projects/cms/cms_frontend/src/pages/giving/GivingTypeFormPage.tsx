import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader } from '../../ui';
import { createGivingType, listGivingTypes, updateGivingType } from '../../api/givingApi';
import { invalidateLookups } from '../../features/finance/components/lookups';
import { AccountSelect, FundSelect } from '../../features/finance/components/Selectors';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function GivingTypeFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const navigate = useNavigate();
  const submit = useSubmit();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [incomeAccountId, setIncome] = useState<number | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [taxDeductible, setTax] = useState(false);
  const [isActive, setActive] = useState(true);

  useEffect(() => {
    if (!id) return;
    listGivingTypes(true).then((all) => {
      const t = all.find((x) => x.id === id);
      if (!t) return;
      setCode(t.code); setName(t.name); setIncome(t.incomeAccountId); setFundId(t.defaultFundId); setTax(t.taxDeductible); setActive(t.isActive);
    });
  }, [id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await submit.run(async () => {
      if (id) return updateGivingType(id, { name, incomeAccountId: incomeAccountId!, defaultFundId: fundId, taxDeductible, isActive });
      return createGivingType({ code, name, incomeAccountId: incomeAccountId!, defaultFundId: fundId, taxDeductible });
    }, 'Giving type saved');
    if (result) {
      invalidateLookups('giving-types');
      navigate('/giving/types');
    }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit giving type' : 'New giving type'} crumbs={[{ label: 'Giving types', to: '/giving/types' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Code" required hint="Letters, digits and dashes; cannot change later">{(c) => <Input {...c} value={code} disabled={!!id} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />}</Field>
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
            <Field label="Income account" required>{(c) => <AccountSelect {...c} types={['INCOME']} value={incomeAccountId} onChange={setIncome} />}</Field>
            <Field label="Default fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="None" value={fundId} onChange={setFundId} />}</Field>
          </div>
          <label className="ui-row"><input type="checkbox" checked={taxDeductible} onChange={(e) => setTax(e.target.checked)} /> Tax deductible (shown on giving statements)</label>
          {id && <label className="ui-row"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
          <FormError error={submit.error} />
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={submit.loading} disabled={!name || !incomeAccountId || (!id && code.length < 2)}>Save</Button>
            <Button to="/giving/types" variant="ghost">Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
