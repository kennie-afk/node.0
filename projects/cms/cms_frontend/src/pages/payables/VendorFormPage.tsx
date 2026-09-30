import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../ui';
import { createVendor, getVendor, updateVendor, type VendorKind } from '../../api/payablesApi';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

export default function VendorFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const navigate = useNavigate();
  const submit = useSubmit();
  const [f, setF] = useState({ name: '', kind: 'VENDOR' as VendorKind, kraPin: '', phone: '', email: '', bankName: '', bankAccount: '', mpesaNumber: '', notes: '', isActive: true });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!id) return;
    getVendor(id).then((v) => setF({ name: v.name, kind: v.kind, kraPin: v.kraPin ?? '', phone: v.phone ?? '', email: v.email ?? '', bankName: v.bankName ?? '', bankAccount: v.bankAccount ?? '', mpesaNumber: v.mpesaNumber ?? '', notes: v.notes ?? '', isActive: v.isActive }));
  }, [id]);
  const n = (s: string) => (s.trim() === '' ? null : s.trim());
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: f.name, kind: f.kind, kraPin: n(f.kraPin), phone: n(f.phone), email: n(f.email), bankName: n(f.bankName), bankAccount: n(f.bankAccount), mpesaNumber: n(f.mpesaNumber), notes: n(f.notes) };
    const saved = await submit.run(() => (id ? updateVendor(id, { ...body, isActive: f.isActive }) : createVendor(body as never)), 'Vendor saved');
    if (saved) navigate('/payables/vendors');
  };
  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? 'Edit vendor' : 'New vendor'} crumbs={[{ label: 'Vendors', to: '/payables/vendors' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Name" required>{(c) => <Input {...c} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={150} />}</Field>
            <Field label="Kind">{(c) => <Select {...c} value={f.kind} onChange={(e) => set('kind', e.target.value as VendorKind)}><option value="VENDOR">Supplier</option><option value="STAFF">Staff (for expense claims)</option><option value="MEMBER">Member</option></Select>}</Field>
            <Field label="KRA PIN" error={submit.error?.fieldMessage('kraPin')}>{(c) => <Input {...c} value={f.kraPin} onChange={(e) => set('kraPin', e.target.value.toUpperCase())} placeholder="A123456789B" />}</Field>
            <Field label="Phone">{(c) => <Input {...c} value={f.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
            <Field label="M-Pesa number" error={submit.error?.fieldMessage('mpesaNumber')}>{(c) => <Input {...c} value={f.mpesaNumber} onChange={(e) => set('mpesaNumber', e.target.value)} placeholder="0712345678" />}</Field>
            <Field label="Email" error={submit.error?.fieldMessage('email')}>{(c) => <Input {...c} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />}</Field>
            <Field label="Bank">{(c) => <Input {...c} value={f.bankName} onChange={(e) => set('bankName', e.target.value)} />}</Field>
            <Field label="Bank account">{(c) => <Input {...c} value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} />}</Field>
            <Field label="Notes">{(c) => <Textarea {...c} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />}</Field>
          </div>
          {id && <label className="ui-row"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>}
          <FormError error={submit.error} />
          <div className="ui-form-actions"><Button type="submit" variant="primary" loading={submit.loading} disabled={f.name.trim().length < 2}>Save</Button><Button to="/payables/vendors" variant="ghost">Cancel</Button></div>
        </form>
      </Card>
    </div>
  );
}
