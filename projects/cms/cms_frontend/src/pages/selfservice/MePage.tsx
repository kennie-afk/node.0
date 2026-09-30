import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, StatTile, StatusPill, formatDateTime, formatMoney, useQuery, useToast } from '../../ui';
import { me, myEvents, myGiving } from '../../api/selfserviceApi';
import { respond } from '../../api/volunteersApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MeTabs } from './MeTabs';
import { isNotLinked } from '../../features/ops/lib/notLinked';
import { NotLinked } from './NotLinked';

export default function MePage() {
  const profile = useQuery(me, []);
  const events = useQuery(myEvents, []);
  const giving = useQuery(() => myGiving({ year: new Date().getFullYear(), limit: 1 }), []);
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  if (profile.loading && !profile.data) return <PageLoader />;
  if (profile.error && !profile.data) return <ErrorState message={profile.error.message} onRetry={profile.refetch} requestId={profile.error.requestId} />;
  const p = profile.data!;
  const linked = p.member !== null;

  const answer = async (id: number, status: 'CONFIRMED' | 'DECLINED') => {
    setBusy(id);
    try {
      await respond(id, status);
      toast.success(status === 'CONFIRMED' ? 'Thank you, you are confirmed.' : 'Noted. The coordinator will find cover.');
      events.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <OpsPage>
      <PageHeader title={linked ? `Welcome, ${p.member!.firstName}` : `Welcome, ${p.user.username}`} subtitle={<>Signed in as {p.user.email}{p.member ? ` · ${p.member.status} member` : ''}</>} />
      <MeTabs active="home" />
      {!linked && <NotLinked />}
      {linked && (
        <>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '150px' }}>
            <StatTile label="Coming up" value={events.data?.upcoming.length ?? '-'} foot="Events" />
            <StatTile label="Serving" value={events.data?.serving.length ?? '-'} foot="Upcoming slots" />
            {!isNotLinked(giving.error) && !giving.error && <StatTile label={`Given in ${new Date().getFullYear()}`} value={giving.data ? formatMoney(giving.data.totalForYear) : '-'} foot="From your giving records" />}
          </div>
          <div className="ops-split">
            <Card title="Coming up">
              {events.data && events.data.upcoming.length === 0 ? <span className="ops-muted">Nothing scheduled.</span> : (
                <ul className="ops-list">{(events.data?.upcoming ?? []).map((e) => <li key={e.id}><span><strong>{e.name}</strong>{e.location ? <span className="ops-muted"> · {e.location}</span> : null}</span><span className="ops-muted">{formatDateTime(e.startTime)}</span></li>)}</ul>
              )}
            </Card>
            <Card title="Where you are serving">
              {events.data && events.data.serving.length === 0 ? <span className="ops-muted">You are not rostered on anything yet.</span> : (
                <ul className="ops-list">
                  {(events.data?.serving ?? []).map((s) => (
                    <li key={s.id} style={{ alignItems: 'flex-start' }}>
                      <span><strong>{s.eventName}</strong> <span className="ops-muted">· {s.teamName}<br />{formatDateTime(s.startsAt)}</span></span>
                      <span className="ui-stack" style={{ alignItems: 'flex-end' }}>
                        <StatusPill status={s.status} />
                        {s.status === 'PENDING' && <span className="ui-actions"><Button size="sm" variant="primary" loading={busy === s.id} onClick={() => answer(s.id, 'CONFIRMED')}>I can serve</Button><Button size="sm" variant="secondary" loading={busy === s.id} onClick={() => answer(s.id, 'DECLINED')}>I cannot</Button></span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 8 }}><Link to="/me/availability" className="ops-muted">Mark dates you cannot serve</Link></div>
            </Card>
          </div>
          <Badge tone="info">Your details are private to you and the church office.</Badge>
        </>
      )}
    </OpsPage>
  );
}
