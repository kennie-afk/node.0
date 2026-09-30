import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, DateInput, Field, Input, InlineConfirm, MoneyInput, PageHeader, Select, todayISO, useToast } from '../../ui';
import { createEmployee, deleteEmployee, getEmployee, updateEmployee, type Allowance, type Deduction } from '../../api/payrollApi';
import { normalizeError } from '../../api/http';
import { FundSelect, MemberPicker, MinistrySelect } from '../../features/finance/components/Selectors';
import { memberOption } from '../../features/finance/components/selectorHelpers';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';
import type { ComboOption } from '../../ui';

export default function EmployeeFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmit();
  const [f, setF] = useState({ fullName: '', nationalId: '', kraPin: '', nssfNo: '', shifNo: '', email: '', phone: '', bankName: '', bankAccount: '', mpesaPhone: '', jobTitle: '', basicSalary: '', insurancePremium: '', startDate: todayISO(), endDate: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' });
  const [fundId, setFundId] = useState<number | null>(null);
  const [ministryId, setMinistryId] = useState<number | null>(null);
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const n = (s: string) => (s.trim() === '' ? null : s.trim());

  useEffect(() => {
    if (!id) return;
    getEmployee(id).then(async (e) => {
      setF({ fullName: e.fullName, nationalId: e.nationalId ?? '', kraPin: e.kraPin ?? '', nssfNo: e.nssfNo ?? '', shifNo: e.shifNo ?? '', email: e.email ?? '', phone: e.phone ?? '', bankName: e.bankName ?? '', bankAccount: e.bankAccount ?? '', mpesaPhone: e.mpesaPhone ?? '', jobTitle: e.jobTitle ?? '', basicSalary: e.basicSalary, insurancePremium: e.insurancePremium, startDate: e.startDate, endDate: e.endDate ?? '', status: e.status });
      setFundId(e.fundId); setMinistryId(e.ministryId); setAllowances(e.allowances); setDeductions(e.deductions);
      if (e.memberId) setMember(await memberOption(e.memberId));
    });
  }, [id]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { memberId: member?.value ?? null, fullName: f.fullName, nationalId: n(f.nationalId), kraPin: n(f.kraPin), nssfNo: n(f.nssfNo), shifNo: n(f.shifNo), email: n(f.email), phone: n(f.phone), bankName: n(f.bankName), bankAccount: n(f.bankAccount), mpesaPhone: n(f.mpesaPhone), jobTitle: n(f.jobTitle), basicSalary: f.basicSalary, insurancePremium: f.insurancePremium || undefined, allowances: allowances.filter((a) => a.name.trim()), deductions: deductions.filter((d) => d.name.trim()), fundId, ministryId, startDate: f.startDate, endDate: n(f.endDate), status: f.status };
    const saved = await submit.run(() => (id ? updateEmployee(id, body) : createEmployee(body)), 'Employee saved');
    if (saved) navigate('/payroll/employees');
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit employee' : 'Add employee'} crumbs={[{ label: 'Employees', to: '/payroll/employees' }]} />
      <form className="ui-stack" onSubmit={onSubmit}>
        <Card title="Person">
          <div className="ui-form-grid">
            <Field label="Full name" required>{(c) => <Input {...c} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={150} />}</Field>
            <Field label="Job title">{(c) => <Input {...c} value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} maxLength={100} />}</Field>
            <Field label="Linked member" hint="Optional">{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
            <Field label="National ID">{(c) => <Input {...c} value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} />}</Field>
            <Field label="Phone" error={submit.error?.fieldMessage('phone')}>{(c) => <Input {...c} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712345678" />}</Field>
            <Field label="Email" error={submit.error?.fieldMessage('email')}>{(c) => <Input {...c} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />}</Field>
          </div>
        </Card>
        <Card title="Statutory numbers">
          <div className="ui-form-grid">
            <Field label="KRA PIN" error={submit.error?.fieldMessage('kraPin')}>{(c) => <Input {...c} value={f.kraPin} onChange={(e) => set('kraPin', e.target.value.toUpperCase())} placeholder="A123456789Z" />}</Field>
            <Field label="NSSF number">{(c) => <Input {...c} value={f.nssfNo} onChange={(e) => set('nssfNo', e.target.value)} />}</Field>
            <Field label="SHIF number">{(c) => <Input {...c} value={f.shifNo} onChange={(e) => set('shifNo', e.target.value)} />}</Field>
          </div>
        </Card>
        <Card title="Pay">
          <div className="ui-form-grid">
            <Field label="Basic monthly salary" required error={submit.error?.fieldMessage('basicSalary')}>{(c) => <MoneyInput {...c} value={f.basicSalary} onChange={(v) => set('basicSalary', v)} />}</Field>
            <Field label="Insurance premium per month" hint="For insurance relief">{(c) => <MoneyInput {...c} value={f.insurancePremium} onChange={(v) => set('insurancePremium', v)} />}</Field>
            <Field label="Start date" required>{(c) => <DateInput {...c} value={f.startDate} onChange={(v) => set('startDate', v)} />}</Field>
            <Field label="End date">{(c) => <DateInput {...c} value={f.endDate} onChange={(v) => set('endDate', v)} />}</Field>
            <Field label="Paid from fund" hint="Salary cost is charged to this fund">{(c) => <FundSelect {...c} allowEmpty emptyLabel="General fund" value={fundId} onChange={setFundId} />}</Field>
            <Field label="Ministry">{(c) => <MinistrySelect {...c} value={ministryId} onChange={setMinistryId} />}</Field>
            <Field label="Bank">{(c) => <Input {...c} value={f.bankName} onChange={(e) => set('bankName', e.target.value)} />}</Field>
            <Field label="Bank account">{(c) => <Input {...c} value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} />}</Field>
            <Field label="M-Pesa phone">{(c) => <Input {...c} value={f.mpesaPhone} onChange={(e) => set('mpesaPhone', e.target.value)} />}</Field>
            {id && <Field label="Status">{(c) => <Select {...c} value={f.status} onChange={(e) => set('status', e.target.value as 'ACTIVE' | 'INACTIVE')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>}</Field>}
          </div>
        </Card>
        <Card title="Allowances" actions={<Button type="button" size="sm" onClick={() => setAllowances((a) => [...a, { name: '', amount: '', taxable: true }])}>Add allowance</Button>}>
          {allowances.length === 0 && <p className="fin-muted">None. Housing or transport allowances go here.</p>}
          {allowances.map((a, i) => (
            <div className="ui-row" key={i} role="group" aria-label={`Allowance ${i + 1}`}>
              <Input aria-label="Allowance name" placeholder="Name" value={a.name} onChange={(e) => setAllowances((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <MoneyInput aria-label="Allowance amount" value={a.amount} onChange={(v) => setAllowances((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              <label className="ui-row"><input type="checkbox" checked={a.taxable} onChange={(e) => setAllowances((xs) => xs.map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)))} /> Taxable</label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAllowances((xs) => xs.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
        </Card>
        <Card title="Other deductions" actions={<Button type="button" size="sm" onClick={() => setDeductions((d) => [...d, { name: '', amount: '' }])}>Add deduction</Button>}>
          {deductions.length === 0 && <p className="fin-muted">None. Union dues or a SACCO contribution go here. Staff advances are recovered automatically.</p>}
          {deductions.map((d, i) => (
            <div className="ui-row" key={i} role="group" aria-label={`Deduction ${i + 1}`}>
              <Input aria-label="Deduction name" placeholder="Name" value={d.name} onChange={(e) => setDeductions((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <MoneyInput aria-label="Deduction amount" value={d.amount} onChange={(v) => setDeductions((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setDeductions((xs) => xs.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
        </Card>
        <FormError error={submit.error} />
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={submit.loading} disabled={!f.fullName || !f.basicSalary}>Save employee</Button>
          <Button to="/payroll/employees" variant="ghost">Cancel</Button>
          {id && <InlineConfirm label="Remove" question="Remove this employee? One who has payslips is made inactive instead." onConfirm={async () => { try { await deleteEmployee(id); toast.success('Employee removed'); navigate('/payroll/employees'); } catch (x) { toast.error(normalizeError(x).message); } }} />}
        </div>
      </form>
    </div>
  );
}
