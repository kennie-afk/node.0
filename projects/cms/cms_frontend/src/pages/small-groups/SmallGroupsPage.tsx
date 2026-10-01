import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig, PageOf } from '../../features/resource/types';
import MembershipPanel from '../../components/common/MembershipPanel';
import { http } from '../../api/http';
import { searchMembers, leaderOption } from '../../api/memberLookup';
import { Badge } from '../../ui';
import { addSmallGroupMember, fetchSmallGroupMembers, removeSmallGroupMember, type SmallGroup } from '../../api/smallGroupApi';
import type { Ministry } from '../../api/ministryApi';

const searchMinistries = async (q: string) =>
  (await http.get<PageOf<Ministry>>('/ministries', { q: q || undefined, pageSize: 10 })).data.map((m) => ({ value: m.id, label: m.name }));

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => ({ value: d, label: d }));

const ministryOf = (g: SmallGroup) => g.parentMinistry ?? g.ministry;

const config: ResourceConfig<SmallGroup> = {
  noun: 'small group',
  plural: 'small groups',
  title: 'Small groups',
  subtitle: 'Fellowship groups under each ministry, with meeting time and roster.',
  endpoint: '/small-groups',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by name or description',
  columns: [
    { key: 'name', header: 'Group', render: (g) => <strong>{g.name}</strong> },
    { key: 'ministry', header: 'Ministry', render: (g) => ministryOf(g)?.name ?? '-' },
    { key: 'leader', header: 'Leader', render: (g) => (g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : '-') },
    { key: 'meetingDay', header: 'Meets', render: (g) => [g.meetingDay, g.meetingTime].filter(Boolean).join(' ') || '-' },
    { key: 'meetingLocation', header: 'Location', render: (g) => g.meetingLocation || '-' },
    { key: 'isActive', header: 'Status', render: (g) => (g.isActive === false ? <Badge>Inactive</Badge> : <Badge tone="ok">Active</Badge>) }
  ],
  fields: [
    { name: 'name', label: 'Name', required: true, maxLength: 255, hint: 'At least 3 characters' },
    { name: 'ministryId', label: 'Ministry', type: 'lookup', required: true, search: searchMinistries },
    { name: 'leaderId', label: 'Leader', type: 'lookup', search: searchMembers },
    { name: 'meetingDay', label: 'Meeting day', type: 'select', options: DAYS },
    { name: 'meetingTime', label: 'Meeting time', type: 'time' },
    { name: 'meetingLocation', label: 'Meeting location', maxLength: 255 },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'isActive', label: 'Active', type: 'checkbox', hint: 'Active', initial: true }
  ],
  toForm: (g) => ({
    name: g.name, description: g.description ?? '', meetingDay: g.meetingDay ?? '', meetingTime: g.meetingTime ?? '',
    meetingLocation: g.meetingLocation ?? '', isActive: g.isActive !== false,
    ministryId: { value: g.ministryId, label: ministryOf(g)?.name ?? `Ministry ${g.ministryId}` },
    leaderId: leaderOption(g.leaderId, g.leader)
  }),
  editExtra: (g) => (
    <MembershipPanel
      key={g.id}
      title="Members"
      loadRoster={() => fetchSmallGroupMembers(g.id)}
      addMember={(memberId, role) => addSmallGroupMember(g.id, memberId, role)}
      removeMember={(memberId) => removeSmallGroupMember(g.id, memberId)}
    />
  )
};

export default function SmallGroupsPage() {
  return <ResourcePage config={config} />;
}
