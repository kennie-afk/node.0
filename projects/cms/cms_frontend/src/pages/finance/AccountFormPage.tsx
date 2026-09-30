import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, InlineConfirm, PageHeader, PageLoader, Select, Textarea, useQuery, useToast } from '../../ui';
import { createAccount, deleteAccount, listAccounts, updateAccount, type Account, type AccountType } from '../../api/financeApi';
import { normalizeError } from '../../api/http';
import { invalidateLookups } from '../../features/finance/components/lookups';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

/** Loads the chart (for the parent list, and the account when editing), then mounts the form. */
export default function AccountFormPage() {
  const idParam = useParams().id;
  const id = idParam ? Number(idParam) : null;
  const all = useQuery(() => listAccounts({ includeInactive: true }), []);
  if (!all.data) return <PageLoader />;
  return <AccountForm key={id ?? 'new'} id={id} accounts={all.data} />;
}

function AccountForm({ id, accounts }: { id: number | null; accounts: Account[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmit();
  const current = accounts.find((a) => a.id === id);
  const [code, setCode] = useState(current?.code ?? '');
  const [name, setName] = useState(current?.name ?? '');
  const [type, setType] = useState<AccountType>(current?.type ?? 'EXPENSE');
  const [parentId, setParentId] = useState(current?.parentId ? String(current.parentId) : '');
  const [isPostable, setPostable] = useState(current?.isPostable ?? true);
  const [isActive, setActive] = useState(current?.isActive ?? true);
  const [description, setDescription] = useState(current?.description ?? '');

  const headings = accounts.filter((a) => !a.isPostable && a.type === type);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await submit.run(() =>
      id ? updateAccount(id, { name, description: description || null, isActive, isPostable }) : createAccount({ code, name, type, parentId: parentId ? Number(parentId) : null, isPostable, description: description || null }),
      'Account saved');
    if (saved) { invalidateLookups('accounts', 'accounts-all'); navigate('/finance/accounts'); }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={id ? `Edit account ${current?.code ?? ''}` : 'New account'} crumbs={[{ label: 'Chart of accounts', to: '/finance/accounts' }]} />
      <Card>
        <form className="ui-form" onSubmit={onSubmit}>
          <div className="ui-form-grid">
            <Field label="Code" required hint="Cannot change later">{(c) => <Input {...c} value={code} disabled={!!id} onChange={(e) => setCode(e.target.value)} maxLength={12} />}</Field>
            <Field label="Name" required>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />}</Field>
            <Field label="Type" required>{(c) => <Select {...c} value={type} disabled={!!id} onChange={(e) => { setType(e.target.value as AccountType); setParentId(''); }}>{['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}</Select>}</Field>
            <Field label="Under heading">{(c) => <Select {...c} value={parentId} disabled={!!id} onChange={(e) => setParentId(e.target.value)}><option value="">Top level</option>{headings.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</Select>}</Field>
            <Field label="Description">{(c) => <Textarea {...c} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
          </div>
          <label className="ui-row"><input type="checkbox" checked={isPostable} onChange={(e) => setPostable(e.target.checked)} /> Can be posted to (untick for a heading)</label>
          {id && <label className="ui-row"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
          {current?.systemKey && <p className="fin-muted">Automation posts to this account (role {current.systemKey}); it cannot be deactivated or deleted.</p>}
          <FormError error={submit.error} />
          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={submit.loading} disabled={!name || (!id && !code)}>Save</Button>
            <Button to="/finance/accounts" variant="ghost">Cancel</Button>
            {id && !current?.systemKey && (
              <InlineConfirm label="Delete" question="Delete this account? Only possible if it was never used." onConfirm={async () => {
                try { await deleteAccount(id); invalidateLookups('accounts', 'accounts-all'); toast.success('Account deleted'); navigate('/finance/accounts'); } catch (f) { toast.error(normalizeError(f).message); }
              }} />
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
