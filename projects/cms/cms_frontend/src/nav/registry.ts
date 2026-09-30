import { Bell, BookOpen, Calendar, CheckSquare, DollarSign, Home, LayoutDashboard, Users, Users2 } from 'lucide-react';
import { canAny, type Permission } from '../auth/permissions';
import { financeNav } from './finance.nav';
import { opsNav } from './ops.nav';
import type { NavGroup, NavGroupId, NavItem } from './types';

/** Group order in the sidebar. A group with no visible items is not shown. */
export const GROUPS: ReadonlyArray<{ id: NavGroupId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People' },
  { id: 'worship', label: 'Worship & Events' },
  { id: 'giving', label: 'Giving' },
  { id: 'finance', label: 'Finance' },
  { id: 'payables', label: 'Payables' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'reports', label: 'Reports' },
  { id: 'operations', label: 'Operations' },
  { id: 'data', label: 'Data & Privacy' },
  { id: 'admin', label: 'Administration' }
];

/** The screens that existed before the registry. Their routes are unchanged. */
const BASE_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'overview', order: 0, permission: 'members:read' },

  { label: 'Members', path: '/members', icon: Users, group: 'people', order: 10, permission: 'members:read' },
  { label: 'Families', path: '/families', icon: Home, group: 'people', order: 20, permission: 'members:read' },
  { label: 'Ministries', path: '/ministries', icon: Users2, group: 'people', order: 30, permission: 'members:read' },
  { label: 'Small groups', path: '/small-groups', icon: Users2, group: 'people', order: 40, permission: 'members:read' },

  { label: 'Events', path: '/events', icon: Calendar, group: 'worship', order: 10, permission: 'members:read' },
  { label: 'Sermons', path: '/sermons', icon: BookOpen, group: 'worship', order: 20, permission: 'members:read' },
  { label: 'Announcements', path: '/announcements', icon: Bell, group: 'worship', order: 30, permission: 'members:read' },
  { label: 'Attendance', path: '/attendance', icon: CheckSquare, group: 'worship', order: 40, end: true, permission: 'members:read' },
  { label: 'Event attendance', path: '/attendance/event', icon: CheckSquare, group: 'worship', order: 41, permission: 'members:read' },
  { label: 'Sermon attendance', path: '/attendance/sermon', icon: CheckSquare, group: 'worship', order: 42, permission: 'members:read' },

  { label: 'Contributions', path: '/contributions', icon: DollarSign, group: 'giving', order: 10, permission: ['giving:read', 'giving:write'] },

  { label: 'Users', path: '/users', icon: Users, group: 'admin', order: 10, permission: 'users:manage' }
];

const ALL_ITEMS: NavItem[] = [...BASE_ITEMS, ...financeNav, ...opsNav];

export function allNavItems(): readonly NavItem[] {
  return ALL_ITEMS;
}

function permitted(item: NavItem, role: Parameters<typeof canAny>[0]): boolean {
  if (!item.permission) return true;
  const needed: readonly Permission[] = Array.isArray(item.permission) ? (item.permission as readonly Permission[]) : [item.permission as Permission];
  return canAny(role, needed);
}

/** Groups and items the signed-in role may see, in display order. */
export function navFor(role: Parameters<typeof canAny>[0]): NavGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    items: ALL_ITEMS.filter((item) => item.group === group.id && permitted(item, role)).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label)
    )
  })).filter((group) => group.items.length > 0);
}
