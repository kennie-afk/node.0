import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, useQuery } from '../../ui';
import { createRoom, listRooms, updateRoom, type Room } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function RoomFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const rooms = useQuery(listRooms, [], { enabled: id !== null });
  if (id !== null && !rooms.data) return rooms.error ? <ErrorState message={rooms.error.message} onRetry={rooms.refetch} /> : <PageLoader />;
  return <Form key={id ?? 'new'} id={id} room={id !== null ? rooms.data!.find((r) => r.id === id) : undefined} />;
}

function Form({ id, room }: { id: number | null; room?: Room }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState(room?.name ?? '');
  const [minAge, setMinAge] = useState(String(room?.minAgeMonths ?? 0));
  const [maxAge, setMaxAge] = useState(String(room?.maxAgeMonths ?? 36));
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 12));
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const valid = name.trim().length >= 2 && Number(maxAge) >= Number(minAge) && Number(capacity) > 0;
  return (
    <OpsPage>
      <PageHeader title={id ? 'Edit room' : 'New room'} crumbs={[{ label: "Children's check-in", to: '/checkin/rooms' }, { label: id ? 'Edit room' : 'New room' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { name, minAgeMonths: Number(minAge), maxAgeMonths: Number(maxAge), capacity: Number(capacity) };
          const ok = await submit(() => (id ? updateRoom(id, { ...body, isActive }) : createRoom(body)), 'Room saved.');
          if (ok) navigate('/checkin/rooms');
        }}
      >
        <FormBanner error={error} />
        <Field label="Room name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
        <div className="ui-form-grid">
          <Field label="Youngest (months)" error={fieldError('minAgeMonths')} hint="12 months = 1 year">{(c) => <Input {...c} type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} />}</Field>
          <Field label="Oldest (months)" error={fieldError('maxAgeMonths')}>{(c) => <Input {...c} type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />}</Field>
          <Field label="Capacity" error={fieldError('capacity')}>{(c) => <Input {...c} type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />}</Field>
        </div>
        {id !== null && <label className="ops-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Open (children can be checked in)</label>}
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>Save room</Button>
          <Button to="/checkin/rooms" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
