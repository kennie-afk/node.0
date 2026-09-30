import { Button, DataTable, EmptyState, InlineConfirm, PageHeader, StatusPill, useQuery, useToast, type Column } from '../../ui';
import { listAccountLinks, unlinkAccount, type AccountLink } from '../../api/selfserviceApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';

/** Administrators connect each sign-in to a member record so the member's /me pages know who they are. */
export default function AccountLinksPage() {
  const links = useQuery(listAccountLinks, []);
  const toast = useToast();
  const columns: Array<Column<AccountLink>> = [
    { key: 'user', header: 'Sign-in', render: (l) => `${l.username} (${l.email})` },
    { key: 'member', header: 'Linked member', render: (l) => (l.memberId ? `${l.firstName} ${l.lastName}` : <span className="ops-muted">Not linked</span>) },
    { key: 'status', header: '', render: (l) => <StatusPill status={l.memberId ? 'ACTIVE' : 'PENDING'} /> },
    {
      key: 'x', header: '', align: 'right',
      render: (l) => (
        <span className="ui-actions">
          <Button size="sm" variant={l.memberId ? 'ghost' : 'secondary'} to={`/account-links/new?userId=${l.userId}`}>{l.memberId ? 'Change' : 'Link to a member'}</Button>
          {l.memberId && <InlineConfirm label="Unlink" question="Unlink this sign-in?" onConfirm={async () => { try { await unlinkAccount(l.userId); toast.success('Unlinked.'); links.refetch(); } catch (e) { toast.error(normalizeError(e).message); } }} />}
        </span>
      )
    }
  ];
  return (
    <OpsPage>
      <PageHeader title="Member sign-ins" subtitle="Connect a login to the member it belongs to, so they can see their own details, giving and groups." />
      <Notice tone="info">A linked member can only ever see their own records. Staff accounts do not need a link.</Notice>
      <DataTable columns={columns} rows={links.data ?? []} rowKey={(l) => l.userId} loading={links.loading} error={links.error} onRetry={links.refetch} empty={<EmptyState title="No sign-ins yet" message="Create user accounts first, then link them here." action={<Button to="/users" variant="secondary">Users</Button>} />} />
    </OpsPage>
  );
}
