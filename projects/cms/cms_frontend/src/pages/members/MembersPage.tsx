import { Link } from 'react-router-dom';
import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig, PageOf } from '../../features/resource/types';
import { http } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { formatDate } from '../../ui';
import type { Member } from '../../api/memberApi';
import type { Family } from '../../api/familyApi';

const searchFamilies = async (q: string) =>
  (await http.get<PageOf<Family>>('/families', { q, pageSize: 10 })).data.map((f) => ({ value: f.id, label: f.familyName, meta: f.city ?? undefined }));

/** A link to the member's giving statement, shown only to roles that may read giving. */
function GivingLink({ id }: { id: number }) {
  const { can } = useAuth();
  return can('giving:read') ? <Link className="ui-btn is-ghost is-sm" to={`/giving/statements/${id}`}>Giving</Link> : null;
}

const config: ResourceConfig<Member> = {
  noun: 'member',
  plural: 'members',
  title: 'Members',
  subtitle: 'Everyone in the church family, with contact details and family.',
  endpoint: '/members',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by name, email or phone',
  columns: [
    { key: 'name', header: 'Name', render: (m) => <strong>{m.firstName} {m.lastName}</strong> },
    { key: 'email', header: 'Email', render: (m) => m.email || '-' },
    { key: 'phoneNumber', header: 'Phone', render: (m) => m.phoneNumber || '-' },
    { key: 'family', header: 'Family', render: (m) => m.family?.familyName ?? '-' },
    { key: 'createdAt', header: 'Joined', render: (m) => formatDate(m.createdAt) }
  ],
  fields: [
    { name: 'firstName', label: 'First name', required: true, maxLength: 100 },
    { name: 'lastName', label: 'Last name', required: true, maxLength: 100 },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phoneNumber', label: 'Phone', type: 'tel', hint: 'e.g. 0712 345 678' },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
    { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }] },
    { name: 'familyId', label: 'Family', type: 'lookup', search: searchFamilies },
    { name: 'address', label: 'Address', type: 'textarea', maxLength: 255 }
  ],
  toForm: (m) => ({
    firstName: m.firstName, lastName: m.lastName, email: m.email ?? '', phoneNumber: m.phoneNumber ?? '',
    dateOfBirth: (m.dateOfBirth ?? '').slice(0, 10), gender: m.gender ?? '', address: (m as { address?: string }).address ?? '',
    familyId: m.familyId ? { value: m.familyId, label: m.family?.familyName ?? `Family ${m.familyId}` } : null
  }),
  rowActions: (m) => <GivingLink id={m.id} />
};

export default function MembersPage() {
  return <ResourcePage config={config} />;
}
