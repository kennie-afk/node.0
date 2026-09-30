import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, InlineConfirm, PageHeader, PageLoader, StatusPill, formatDateTime, useQuery, useToast } from '../../ui';
import { approveBooking, cancelBooking, getBooking, listResources, rejectBooking } from '../../api/facilitiesApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { isoToLocalDate } from '../../features/ops/lib/dates';

export default function BookingDetailPage() {
  const id = Number(useParams().id);
  const booking = useQuery(() => getBooking(id), [id]);
  const resources = useQuery(listResources, []);
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (booking.loading && !booking.data) return <PageLoader />;
  if (booking.error && !booking.data) return <ErrorState message={booking.error.message} onRetry={booking.refetch} requestId={booking.error.requestId} />;
  const b = booking.data;
  if (!b) return <OpsPage><EmptyState title="Booking not found" action={<Button to="/facilities/bookings">Back to bookings</Button>} /></OpsPage>;
  const resource = resources.data?.find((r) => r.id === b.resourceId);
  const live = b.status === 'PENDING' || b.status === 'APPROVED';
  const back = `/facilities/bookings?resourceId=${b.resourceId}&week=${isoToLocalDate(b.startsAt)}`;

  const act = async (work: () => Promise<unknown>, done: string, leave = false) => {
    try {
      await work();
      toast.success(done);
      if (leave) navigate(back);
      else booking.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  return (
    <OpsPage>
      <PageHeader title={b.title} crumbs={[{ label: 'Facilities', to: '/facilities/bookings' }, { label: b.title }]} subtitle={<>{resource?.name ?? `Resource #${b.resourceId}`} · <StatusPill status={b.status} /></>}
        actions={live && (
          <>
            {b.status === 'PENDING' && can('users:manage') && <><Button variant="primary" onClick={() => act(() => approveBooking(id), 'Approved.')}>Approve</Button><Button variant="secondary" onClick={() => act(() => rejectBooking(id), 'Declined.')}>Decline</Button></>}
            {can('members:write') && <InlineConfirm label="Cancel this one" question="Cancel this booking?" onConfirm={() => act(() => cancelBooking(id, 'ONE'), 'Booking cancelled.', true)} />}
            {can('members:write') && b.seriesId && <InlineConfirm label="Cancel the whole series" question="Cancel every booking in this series?" onConfirm={() => act(() => cancelBooking(id, 'SERIES'), 'Series cancelled.', true)} />}
          </>
        )} />
      <Card title="Details">
        <dl className="ui-stack" style={{ margin: 0 }}>
          <div><strong>Starts</strong> {formatDateTime(b.startsAt)}</div>
          <div><strong>Ends</strong> {formatDateTime(b.endsAt)}</div>
          {b.seriesId && <div className="ops-muted">Part of a repeating series.</div>}
          {b.notes && <div className="ops-note-body">{b.notes}</div>}
        </dl>
      </Card>
      <div><Button to={back} variant="ghost">Back to the calendar</Button></div>
    </OpsPage>
  );
}
