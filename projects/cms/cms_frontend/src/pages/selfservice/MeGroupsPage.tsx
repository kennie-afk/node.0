import { Card, EmptyState, ErrorState, PageHeader, PageLoader, formatDateTime, useQuery } from '../../ui';
import { myEvents, myGroups } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MeTabs } from './MeTabs';
import { isNotLinked } from '../../features/ops/lib/notLinked';
import { NotLinked } from './NotLinked';

export default function MeGroupsPage() {
  const groups = useQuery(myGroups, []);
  const events = useQuery(myEvents, []);
  if (groups.loading && !groups.data) return <PageLoader />;
  if (isNotLinked(groups.error)) return <OpsPage><PageHeader title="Groups and events" /><MeTabs active="groups" /><NotLinked /></OpsPage>;
  if (groups.error && !groups.data) return <ErrorState message={groups.error.message} onRetry={groups.refetch} requestId={groups.error.requestId} />;
  const roleOf = (g: Record<string, unknown>) => (typeof g.role === 'string' && g.role ? ` · ${g.role}` : '');
  return (
    <OpsPage>
      <PageHeader title="Groups and events" />
      <MeTabs active="groups" />
      <div className="ops-split">
        <div className="ui-stack">
          <Card title="Ministries">
            {groups.data?.ministries.length === 0 ? <EmptyState title="Not in a ministry yet" message="Ask a ministry leader or the church office to add you." /> : <ul className="ops-list">{groups.data?.ministries.map((g) => <li key={g.id}>{g.name}<span className="ops-muted">{roleOf(g)}</span></li>)}</ul>}
          </Card>
          <Card title="Small groups">
            {groups.data?.smallGroups.length === 0 ? <EmptyState title="Not in a small group yet" message="Small groups meet during the week. Ask about one near you." /> : <ul className="ops-list">{groups.data?.smallGroups.map((g) => <li key={g.id}>{g.name}<span className="ops-muted">{roleOf(g)}</span></li>)}</ul>}
          </Card>
        </div>
        <Card title="Upcoming events">
          {events.data && events.data.upcoming.length === 0 ? <span className="ops-muted">Nothing scheduled.</span> : <ul className="ops-list">{(events.data?.upcoming ?? []).map((e) => <li key={e.id}><span><strong>{e.name}</strong>{e.location ? <span className="ops-muted"> · {e.location}</span> : null}</span><span className="ops-muted">{formatDateTime(e.startTime)}</span></li>)}</ul>}
        </Card>
      </div>
    </OpsPage>
  );
}
