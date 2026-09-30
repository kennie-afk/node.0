import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, LoadMore, PageHeader, Select, Tabs, formatDateTime, todayISO, useKeysetList, useQuery, useToast, type Column } from '../../ui';
import { approveBooking, listBookings, listResources, rejectBooking, type Booking } from '../../api/facilitiesApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { layoutDay } from '../../features/ops/lib/calendar';
import { addDays, dayLabel, localToISO, startOfWeek, weekDays } from '../../features/ops/lib/dates';
import { FacilitiesTabs } from './FacilitiesTabs';

const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const HOUR_PX = 34;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

function Approvals() {
  const pending = useKeysetList<Booking>('/facilities/bookings', { status: 'PENDING' });
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const decide = async (b: Booking, ok: boolean) => {
    setBusy(b.id);
    try {
      await (ok ? approveBooking(b.id) : rejectBooking(b.id));
      toast.success(ok ? 'Booking approved.' : 'Booking declined.');
      pending.refresh();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(null);
    }
  };
  const columns: Array<Column<Booking>> = [
    { key: 'title', header: 'Booking', render: (b) => <Link to={`/facilities/bookings/${b.id}`}>{b.title}</Link> },
    { key: 'resource', header: 'Room or item', render: (b) => b.resourceName ?? `#${b.resourceId}` },
    { key: 'when', header: 'When', render: (b) => `${formatDateTime(b.startsAt)} - ${fmtTime(b.endsAt)}` },
    { key: 'series', header: '', render: (b) => (b.seriesId ? <Badge>Repeats</Badge> : null) },
    { key: 'x', header: '', align: 'right', render: (b) => (can('users:manage') ? <span className="ui-actions"><Button size="sm" variant="primary" loading={busy === b.id} onClick={() => decide(b, true)}>Approve</Button><Button size="sm" variant="secondary" loading={busy === b.id} onClick={() => decide(b, false)}>Decline</Button></span> : null) }
  ];
  return <DataTable columns={columns} rows={pending.items} rowKey={(b) => b.id} loading={pending.loading} error={pending.error} onRetry={pending.refresh} empty={<EmptyState title="Nothing waiting" message="Bookings for rooms that need approval show up here." />} footer={pending.items.length > 0 ? <LoadMore shown={pending.items.length} hasMore={pending.hasMore} loading={pending.loadingMore} onMore={pending.loadMore} noun="bookings" /> : undefined} />;
}

function WeekGrid({ resourceId, week }: { resourceId: number; week: string }) {
  const days = useMemo(() => weekDays(week), [week]);
  const from = localToISO(days[0], '00:00');
  const to = localToISO(addDays(days[6], 1), '00:00');
  const bookings = useQuery(() => listBookings({ resourceId, from, to, limit: 200 }), [resourceId, from, to]);
  const live = (bookings.data?.data ?? []).filter((b) => b.status === 'PENDING' || b.status === 'APPROVED');
  const today = todayISO();
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  return (
    <div className="ui-stack">
      {bookings.error && <div className="ops-banner is-bad" role="alert">{bookings.error.message}</div>}
      <div className="ops-week" style={{ ['--ops-hour' as string]: `${HOUR_PX}px` }} aria-label="Week of bookings" aria-busy={bookings.loading}>
        <div className="ops-week-head" />
        {days.map((d) => <div key={d} className={`ops-week-head ${d === today ? 'is-today' : ''}`}>{dayLabel(d)}</div>)}
        <div className="ops-week-hours" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h, i) => <span key={h} className="ops-week-hour" style={{ top: i * HOUR_PX }}>{String(h).padStart(2, '0')}:00</span>)}
        </div>
        {days.map((d) => (
          <div key={d} className="ops-week-col" style={{ height: hours.length * HOUR_PX }}>
            {layoutDay(live, d).map((p) => {
              const top = Math.max(0, ((p.startMinute - FIRST_HOUR * 60) / 60) * HOUR_PX);
              const bottom = Math.min(hours.length * HOUR_PX, ((p.endMinute - FIRST_HOUR * 60) / 60) * HOUR_PX);
              if (bottom <= 0 || top >= hours.length * HOUR_PX) return null;
              return (
                <Link key={`${p.item.id}-${d}`} to={`/facilities/bookings/${p.item.id}`} className={`ops-block ${p.item.status === 'PENDING' ? 'is-pending' : ''}`} style={{ top, height: Math.max(14, bottom - top), left: `${(p.lane / p.lanes) * 100}%`, width: `calc(${100 / p.lanes}% - 2px)` }} title={`${p.item.title} ${fmtTime(p.item.startsAt)}-${fmtTime(p.item.endsAt)}${p.item.status === 'PENDING' ? ' (waiting for approval)' : ''}`}>
                  <strong>{p.item.title}</strong><br />{fmtTime(p.item.startsAt)}-{fmtTime(p.item.endsAt)}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="ops-muted">Dashed blocks are waiting for approval. Bookings outside 06:00-22:00 are clipped; open the booking to see its times.</div>
      {(bookings.data?.nextCursor ?? null) && <div className="ops-banner is-warn">More than 200 bookings this week; the grid shows the first 200.</div>}
    </div>
  );
}

export default function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const resources = useQuery(listResources, []);
  const [tab, setTab] = useState<'week' | 'approvals'>('week');
  const { can } = useAuth();
  const active = (resources.data ?? []).filter((r) => r.isActive);
  const resourceId = params.get('resourceId') ? Number(params.get('resourceId')) : active[0]?.id;
  const week = startOfWeek(params.get('week') ?? todayISO());
  const go = (next: { resourceId?: number; week?: string }) => setParams({ resourceId: String(next.resourceId ?? resourceId ?? ''), week: next.week ?? week });

  return (
    <OpsPage>
      <PageHeader title="Facilities" subtitle="Book rooms and equipment. Clashes are refused before anything is saved." actions={can('members:write') ? <Button to={`/facilities/bookings/new${resourceId ? `?resourceId=${resourceId}` : ''}`} variant="primary" icon={<Plus size={12} aria-hidden />}>New booking</Button> : undefined} />
      <FacilitiesTabs active="bookings" />
      <Tabs label="Booking views" active={tab} onChange={setTab} tabs={[{ key: 'week', label: 'Week' }, { key: 'approvals', label: 'Waiting for approval' }]} />
      {tab === 'approvals' ? (
        <Approvals />
      ) : active.length === 0 && !resources.loading ? (
        <EmptyState title="No rooms to show" message="Add a room or item first, then bookings appear on its calendar." action={can('members:write') ? <Button to="/facilities/resources/new" variant="primary">New room or item</Button> : undefined} />
      ) : (
        <>
          <div className="ui-row" style={{ flexWrap: 'wrap' }}>
            <Select aria-label="Room or item" value={resourceId ?? ''} onChange={(e) => go({ resourceId: Number(e.target.value) })}>
              {active.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" icon={<ChevronLeft size={12} aria-hidden />} onClick={() => go({ week: addDays(week, -7) })}>Previous</Button>
            <Button size="sm" variant="secondary" onClick={() => go({ week: todayISO() })}>This week</Button>
            <Button size="sm" variant="secondary" onClick={() => go({ week: addDays(week, 7) })}>Next <ChevronRight size={12} aria-hidden /></Button>
            <span className="ops-muted">{dayLabel(week)} - {dayLabel(addDays(week, 6))}</span>
          </div>
          {resourceId ? <WeekGrid resourceId={resourceId} week={week} /> : null}
        </>
      )}
    </OpsPage>
  );
}
