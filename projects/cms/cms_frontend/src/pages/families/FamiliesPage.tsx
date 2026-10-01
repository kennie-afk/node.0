import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import { searchMembers, leaderOption } from '../../api/memberLookup';
import { formatDate } from '../../ui';
import type { Family } from '../../api/familyApi';

const config: ResourceConfig<Family> = {
  noun: 'family',
  plural: 'families',
  title: 'Families',
  subtitle: 'Households in the church, with contact details and head of family.',
  endpoint: '/families',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by family name, city or county',
  columns: [
    { key: 'familyName', header: 'Family', render: (f) => <strong>{f.familyName}</strong> },
    { key: 'address', header: 'Address', render: (f) => f.address || '-' },
    { key: 'city', header: 'City', render: (f) => f.city || '-' },
    { key: 'phoneNumber', header: 'Phone', render: (f) => f.phoneNumber || '-' },
    { key: 'email', header: 'Email', render: (f) => f.email || '-' },
    { key: 'createdAt', header: 'Added', render: (f) => formatDate(f.createdAt) }
  ],
  fields: [
    { name: 'familyName', label: 'Family name', required: true, maxLength: 100, hint: 'At least 3 characters' },
    { name: 'headOfFamilyMemberId', label: 'Head of family', type: 'lookup', search: searchMembers },
    { name: 'phoneNumber', label: 'Phone', type: 'tel', maxLength: 20 },
    { name: 'email', label: 'Email', type: 'email', maxLength: 100 },
    { name: 'address', label: 'Address', maxLength: 255 },
    { name: 'city', label: 'City', maxLength: 100 },
    { name: 'county', label: 'County', maxLength: 100 },
    { name: 'postalCode', label: 'Postal code', maxLength: 20 },
    { name: 'notes', label: 'Notes', type: 'textarea' }
  ],
  // The list does not embed the head of family, so the picker shows a placeholder label until a new one is chosen.
  toForm: (f) => ({
    familyName: f.familyName, phoneNumber: f.phoneNumber ?? '', email: f.email ?? '', address: f.address ?? '',
    city: f.city ?? '', county: f.county ?? '', postalCode: f.postalCode ?? '', notes: f.notes ?? '',
    headOfFamilyMemberId: leaderOption(f.headOfFamilyMemberId)
  })
};

export default function FamiliesPage() {
  return <ResourcePage config={config} />;
}
