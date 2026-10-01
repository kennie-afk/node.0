import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import MembershipPanel from '../../components/common/MembershipPanel';
import { searchMembers, leaderOption } from '../../api/memberLookup';
import { Badge } from '../../ui';
import { addMinistryMember, fetchMinistryMembers, removeMinistryMember, type Ministry } from '../../api/ministryApi';

const config: ResourceConfig<Ministry> = {
  noun: 'ministry',
  plural: 'ministries',
  title: 'Ministries',
  subtitle: 'Teams that serve the church, each with a leader and a roster.',
  endpoint: '/ministries',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by name or description',
  columns: [
    { key: 'name', header: 'Ministry', render: (m) => <strong>{m.name}</strong> },
    { key: 'description', header: 'Description', render: (m) => m.description || '-' },
    { key: 'leader', header: 'Leader', render: (m) => (m.leader ? `${m.leader.firstName} ${m.leader.lastName}` : '-') },
    { key: 'isActive', header: 'Status', render: (m) => (m.isActive === false ? <Badge>Inactive</Badge> : <Badge tone="ok">Active</Badge>) }
  ],
  fields: [
    { name: 'name', label: 'Name', required: true, maxLength: 255, hint: 'At least 3 characters' },
    { name: 'leaderId', label: 'Leader', type: 'lookup', search: searchMembers },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'isActive', label: 'Active', type: 'checkbox', hint: 'Active', initial: true }
  ],
  toForm: (m) => ({
    name: m.name, description: m.description ?? '', isActive: m.isActive !== false,
    leaderId: leaderOption(m.leaderId, m.leader)
  }),
  editExtra: (m) => (
    <MembershipPanel
      key={m.id}
      title="Members"
      loadRoster={() => fetchMinistryMembers(m.id)}
      addMember={(memberId, role) => addMinistryMember(m.id, memberId, role)}
      removeMember={(memberId) => removeMinistryMember(m.id, memberId)}
    />
  )
};

export default function MinistriesPage() {
  return <ResourcePage config={config} />;
}
