import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, DataTable, DateInput, Field, FilterBar, InlineConfirm, LoadMore, PageHeader, SearchInput, Select, StatusPill, useKeysetList, useQuery, useToast, formatDate, type ComboOption } from '../../ui';
import { http, normalizeError, type ApiError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { ResourceForm, type FormValues } from '../../features/resource/ResourceForm';
import type { FieldDef, PageOf } from '../../features/resource/types';
import { MEMBER_STATUSES, type Member } from '../../api/memberApi';
import type { Family } from '../../api/familyApi';

const searchFamilies = async (q: string) =>
  (await http.get<PageOf<Family>>('/families', { q, pageSize: 10 })).data.map((f) => ({ value: f.id, label: f.familyName, meta: f.city ?? undefined }));

const fields: FieldDef[] = [
  { name: 'firstName', label: 'First name', required: true, maxLength: 100 },
  { name: 'middleName', label: 'Middle name', maxLength: 100 },
  { name: 'lastName', label: 'Last name', required: true, maxLength: 100 },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phoneNumber', label: 'Phone', type: 'tel', hint: 'e.g. 0712 345 678', maxLength: 20 },
  { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }] },
  { name: 'status', label: 'Status', type: 'select', required: true, initial: 'Active', options: MEMBER_STATUSES.map((s) => ({ value: s, label: s })) },
  { name: 'membershipDate', label: 'Member since', type: 'date', required: true, initial: new Date().toISOString().slice(0, 10) },
  { name: 'baptismDate', label: 'Baptised on', type: 'date' },
  { name: 'familyId', label: 'Family', type: 'lookup', search: searchFamilies },
  { name: 'address', label: 'Address', type: 'textarea', maxLength: 255 },
  { name: 'city', label: 'Town or city', maxLength: 100 },
  { name: 'county', label: 'County', maxLength: 100 },
  { name: 'postalCode', label: 'Postal code', maxLength: 20 },
  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 5000 }
];

const day = (v?: string | null) => (v ?? '').slice(0, 10);

function toForm(m: Member): FormValues {
  return {
    firstName: m.firstName, middleName: m.middleName ?? '', lastName: m.lastName, email: m.email ?? '', phoneNumber: m.phoneNumber ?? '',
    dateOfBirth: day(m.dateOfBirth), gender: m.gender ?? '', status: m.status ?? 'Active', membershipDate: day(m.membershipDate),
    baptismDate: day(m.baptismDate), address: (m as { address?: string }).address ?? '', city: m.city ?? '', county: m.county ?? '',
    postalCode: m.postalCode ?? '', notes: m.notes ?? '',
    familyId: m.familyId ? { value: m.familyId, label: m.family?.familyName ?? `Family ${m.familyId}` } : null
  };
}

function toPayload(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'lookup') out[f.name] = v ? (v as ComboOption<number>).value : null;
    else {
      const text = typeof v === 'string' ? v.trim() : v;
      out[f.name] = text === '' ? (f.required ? undefined : null) : text;
    }
  }
  return out;
}

/**
 * Members: server-side search and filters (status, ministry, joined range), cursor paging with no
 * total, an inline form with every field the record holds, and a link into each person's profile.
 */
export default function MembersPage() {
  const { can } = useAuth();
  const toast = useToast();
  const writable = can('members:write');
  const [filters, setFilters] = useState({ q: '', status: '', ministryId: '', joinedFrom: '', joinedTo: '' });
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));
  const onSearch = useCallback((q: string) => setFilters((f) => ({ ...f, q })), []);
  const ministries = useQuery(() => http.get<PageOf<{ id: number; name: string }>>('/ministries', { pageSize: 100 }), []);
  const list = useKeysetList<Member>('/members', filters, { limit: 25 });
  const [editing, setEditing] = useState<{ row: Member | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const close = () => { setEditing(null); setError(null); };
  const save = async (values: FormValues) => {
    const row = editing?.row ?? null;
    setSubmitting(true);
    setError(null);
    try {
      if (row) await http.put(`/members/${row.id}`, toPayload(values));
      else await http.post('/members', toPayload(values));
      toast.success('Member saved');
      close();
      list.refresh();
    } catch (failure) {
      setError(normalizeError(failure));
    } finally {
      setSubmitting(false);
    }
  };
  const remove = async (row: Member) => {
    try {
      await http.delete(`/members/${row.id}`);
      toast.success('Member deleted');
      list.refresh();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const filtered = Boolean(filters.q || filters.status || filters.ministryId || filters.joinedFrom || filters.joinedTo);

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Members"
        subtitle="Everyone in the church family. Open a person for their giving, attendance, care and family."
        actions={writable ? <Button variant="primary" size="sm" onClick={() => { setError(null); setEditing({ row: null }); }}>New member</Button> : undefined}
      />
      {editing && (
        <Card title={editing.row ? 'Edit member' : 'New member'}>
          <ResourceForm key={editing.row?.id ?? 'new'} title={editing.row ? 'Edit member' : 'New member'} fields={fields} initial={editing.row ? toForm(editing.row) : toForm({ status: 'Active', membershipDate: new Date().toISOString().slice(0, 10) } as Member)} mode={editing.row ? 'edit' : 'create'} submitting={submitting} error={error} onSubmit={save} onCancel={close} />
        </Card>
      )}
      <FilterBar>
        <SearchInput onSearch={onSearch} placeholder="Search by name, email or phone" />
        <Field label="Status">
          {(c) => (
            <Select {...c} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              {MEMBER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Ministry">
          {(c) => (
            <Select {...c} value={filters.ministryId} onChange={(e) => set({ ministryId: e.target.value })}>
              <option value="">Any ministry</option>
              {(ministries.data?.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Joined from">{(c) => <DateInput {...c} value={filters.joinedFrom} onChange={(v) => set({ joinedFrom: v })} />}</Field>
        <Field label="Joined to">{(c) => <DateInput {...c} value={filters.joinedTo} onChange={(v) => set({ joinedTo: v })} />}</Field>
      </FilterBar>
      <DataTable<Member>
        rowKey={(m) => m.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        empty={<span>{filtered ? 'No members match these filters.' : `No members yet.${writable ? ' Use “New member” to add one.' : ''}`}</span>}
        columns={[
          { key: 'name', header: 'Name', render: (m) => <Link to={`/members/${m.id}`}><strong>{m.firstName} {m.lastName}</strong></Link> },
          { key: 'status', header: 'Status', render: (m) => <StatusPill status={m.status} /> },
          { key: 'email', header: 'Email', render: (m) => m.email || '-' },
          { key: 'phoneNumber', header: 'Phone', render: (m) => m.phoneNumber || '-' },
          { key: 'family', header: 'Family', render: (m) => m.family?.familyName ?? '-' },
          { key: 'since', header: 'Member since', render: (m) => formatDate(m.membershipDate ?? m.createdAt) },
          ...(writable
            ? [{
                key: '_actions',
                header: <span className="ui-sr-only">Actions</span>,
                align: 'right' as const,
                render: (m: Member) => (
                  <span className="ui-row" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing({ row: m }); }}>Edit</Button>
                    <InlineConfirm label="Delete" question="Delete this member?" confirmLabel="Delete" onConfirm={() => remove(m)} />
                  </span>
                )
              }]
            : [])
        ]}
        footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="members" /> : undefined}
      />
    </div>
  );
}
