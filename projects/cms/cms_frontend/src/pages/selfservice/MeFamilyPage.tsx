import { Card, EmptyState, ErrorState, PageHeader, PageLoader, formatDate, useQuery } from '../../ui';
import { myFamily } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MeTabs } from './MeTabs';
import { isNotLinked } from '../../features/ops/lib/notLinked';
import { NotLinked } from './NotLinked';

export default function MeFamilyPage() {
  const family = useQuery(myFamily, []);
  if (family.loading && !family.data) return <PageLoader />;
  const linkedError = isNotLinked(family.error);
  if (family.error && !family.data && !linkedError) return <ErrorState message={family.error.message} onRetry={family.refetch} requestId={family.error.requestId} />;
  return (
    <OpsPage>
      <PageHeader title="My family" />
      <MeTabs active="family" />
      {linkedError ? <NotLinked /> : !family.data?.family ? (
        <EmptyState title="No family on record" message="You are not part of a family group yet. The church office can add you to one." />
      ) : (
        <Card title={family.data.family.familyName} subtitle={family.data.family.address ?? undefined}>
          <ul className="ops-list">
            {family.data.members.map((m) => <li key={m.id}><span>{m.firstName} {m.lastName}</span><span className="ops-muted">{m.dateOfBirth ? `Born ${formatDate(m.dateOfBirth)}` : ''}</span></li>)}
          </ul>
        </Card>
      )}
    </OpsPage>
  );
}
