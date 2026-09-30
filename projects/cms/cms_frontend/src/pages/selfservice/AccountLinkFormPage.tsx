import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, PageHeader, Select, useQuery } from '../../ui';
import { linkAccount, listAccountLinks } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function AccountLinkFormPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const links = useQuery(listAccountLinks, []);
  const { submit, busy, error } = useFormSubmit();
  const [userId, setUserId] = useState<number | ''>(search.get('userId') ? Number(search.get('userId')) : '');
  const [memberId, setMemberId] = useState<number | null>(null);
  return (
    <OpsPage>
      <PageHeader title="Link a sign-in to a member" crumbs={[{ label: 'Member sign-ins', to: '/account-links' }, { label: 'Link' }]} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => linkAccount(Number(userId), memberId!), 'Linked.')) navigate('/account-links'); }}>
        <FormBanner error={error} />
        <Field label="Sign-in" required>{(c) => <Select {...c} value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose…</option>{(links.data ?? []).map((l) => <option key={l.userId} value={l.userId}>{l.username} ({l.email}){l.memberId ? ` - now ${l.firstName} ${l.lastName}` : ''}</option>)}</Select>}</Field>
        <Field label="Member" required hint="One sign-in per member. The server refuses a member who is already linked to another login.">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={userId === '' || memberId === null}>Link</Button><Button to="/account-links" variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
