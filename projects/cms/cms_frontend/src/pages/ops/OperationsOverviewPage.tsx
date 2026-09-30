import { Link } from 'react-router-dom';
import { Card, PageHeader, StatTile, formatDateTime, useQuery } from '../../ui';
import { listRooms } from '../../api/checkinApi';
import { listBookings } from '../../api/facilitiesApi';
import { followUps } from '../../api/careApi';
import { listOutboxFailed } from '../../features/ops/lib/overview';
import { dueTasks, pipeline } from '../../api/visitorsApi';
import { reminders } from '../../api/volunteersApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { usePolling } from '../../features/ops/components/usePolling';

/** One glance at what needs attention. Each tile asks for exactly the count it shows and links to the screen that fixes it. */
export default function OperationsOverviewPage() {
  const { can } = useAuth();
  const read = can('members:read');
  const rooms = useQuery(listRooms, [], { enabled: read });
  const unconfirmed = useQuery(() => reminders(168), [], { enabled: read });
  const pending = useQuery(() => listBookings({ status: 'PENDING', limit: 50 }), [], { enabled: read });
  const pipe = useQuery(pipeline, [], { enabled: read });
  const overdue = useQuery(() => dueTasks({ within: 0 }), [], { enabled: read });
  const care = useQuery(() => followUps(7), [], { enabled: can('care:read') });
  const failed = useQuery(listOutboxFailed, [], { enabled: can('comms:send') });
  usePolling(() => {
    rooms.refetch();
    pending.refetch();
  }, 60_000, read);

  const present = (rooms.data ?? []).reduce((n, r) => n + (r.present ?? 0), 0);
  const waiting = (unconfirmed.data ?? []).filter((r) => r.status === 'PENDING');
  const next = [...waiting].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  const careDue = (care.data?.notes.length ?? 0) + (care.data?.visitations.length ?? 0);

  return (
    <OpsPage>
      <PageHeader title="Operations" subtitle="What needs attention across children's ministry, volunteers, facilities, visitors and care." />
      <div className="ui-grid" style={{ ['--ui-min' as string]: '170px' }}>
        {read && <Card to="/checkin"><StatTile label="Children in the building" value={rooms.data ? present : '-'} foot={rooms.data ? `${rooms.data.filter((r) => r.isActive).length} rooms open` : undefined} /></Card>}
        {read && <Card to="/volunteers/reminders"><StatTile label="Volunteers yet to confirm" value={unconfirmed.data ? waiting.length : '-'} tone={waiting.length > 0 ? 'warn' : undefined} foot={next ? `Next: ${next.firstName} ${formatDateTime(next.startsAt)}` : 'Next 7 days'} /></Card>}
        {read && <Card to="/facilities/bookings"><StatTile label="Bookings awaiting approval" value={pending.data ? pending.data.data.length : '-'} tone={(pending.data?.data.length ?? 0) > 0 ? 'warn' : undefined} /></Card>}
        {read && <Card to="/visitors/tasks"><StatTile label="Overdue visitor follow-ups" value={overdue.data ? overdue.data.length : '-'} tone={(overdue.data?.length ?? 0) > 0 ? 'bad' : undefined} foot={pipe.data ? `${pipe.data.stages.NEW} new visitors` : undefined} /></Card>}
        {can('care:read') && <Card to="/care"><StatTile label="Care follow-ups this week" value={care.data ? careDue : '-'} /></Card>}
        {can('comms:send') && <Card to="/comms/outbox"><StatTile label="Messages that failed" value={failed.data ? failed.data : '-'} tone={(failed.data ?? 0) > 0 ? 'bad' : undefined} foot="Needs a look in the delivery log" /></Card>}
      </div>
      <Card title="Where to go">
        <ul className="ops-list">
          {read && <li><Link to="/checkin">Children's check-in station</Link><span className="ops-muted">Check children in and out</span></li>}
          {read && <li><Link to="/volunteers/rosters">Volunteer rosters</Link><span className="ops-muted">Who serves where</span></li>}
          {read && <li><Link to="/facilities/bookings">Room bookings</Link><span className="ops-muted">Weekly calendar</span></li>}
          {read && <li><Link to="/visitors">Visitor pipeline</Link><span className="ops-muted">From first visit to member</span></li>}
          {can('comms:send') && <li><Link to="/comms/campaigns">Communications</Link><span className="ops-muted">SMS and email</span></li>}
          {can('members:write') && <li><Link to="/data/import">Import members</Link><span className="ops-muted">From a spreadsheet</span></li>}
        </ul>
      </Card>
    </OpsPage>
  );
}
