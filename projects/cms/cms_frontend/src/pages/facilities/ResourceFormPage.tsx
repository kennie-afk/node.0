import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, Select, Textarea, useQuery } from '../../ui';
import { createResource, listResources, updateResource, type Resource, type ResourceKind } from '../../api/facilitiesApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function ResourceFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const resources = useQuery(listResources, [], { enabled: id !== null });
  if (id !== null && !resources.data) return resources.error ? <ErrorState message={resources.error.message} onRetry={resources.refetch} /> : <PageLoader />;
  return <Form key={id ?? 'new'} id={id} resource={id !== null ? resources.data!.find((r) => r.id === id) : undefined} />;
}

function Form({ id, resource }: { id: number | null; resource?: Resource }) {
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [name, setName] = useState(resource?.name ?? '');
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? 'ROOM');
  const [capacity, setCapacity] = useState(resource?.capacity ? String(resource.capacity) : '');
  const [requiresApproval, setRequiresApproval] = useState(resource?.requiresApproval ?? false);
  const [description, setDescription] = useState(resource?.description ?? '');
  const [isActive, setIsActive] = useState(resource?.isActive ?? true);
  return (
    <OpsPage>
      <PageHeader title={id ? 'Edit room or item' : 'New room or item'} crumbs={[{ label: 'Facilities', to: '/facilities/resources' }, { label: id ? 'Edit' : 'New' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const cap = capacity.trim() ? Number(capacity) : null;
          const ok = await submit(() => (id ? updateResource(id, { name, capacity: cap, requiresApproval, description: description.trim() || null, isActive }) : createResource({ name, kind, capacity: cap, requiresApproval, description: description.trim() || null })), 'Saved.');
          if (ok) navigate('/facilities/resources');
        }}
      >
        <FormBanner error={error} />
        <Field label="Name" required error={fieldError('name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
        <div className="ui-form-grid">
          <Field label="Type" hint={id ? 'Fixed once created.' : undefined}>{(c) => <Select {...c} value={kind} disabled={id !== null} onChange={(e) => setKind(e.target.value as ResourceKind)}><option value="ROOM">Room</option><option value="EQUIPMENT">Equipment</option><option value="VEHICLE">Vehicle</option></Select>}</Field>
          <Field label="Seats" error={fieldError('capacity')}>{(c) => <Input {...c} type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />}</Field>
        </div>
        <Field label="Notes" error={fieldError('description')}>{(c) => <Textarea {...c} rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <label className="ops-check"><input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} /> Bookings need an administrator's approval</label>
        {id !== null && <label className="ops-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Available for booking</label>}
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>Save</Button>
          <Button to="/facilities/resources" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}
