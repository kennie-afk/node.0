import { useMemo } from 'react';
import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import { Badge, formatDate } from '../../ui';
import { useAuth } from '../../context/auth-context';
import { useRoles } from '../../api/rolesApi';
import type { User } from '../../api/userApi';

/**
 * Sign-in accounts. The role choices are this church's own roles, so the config is built here
 * rather than at module level. The server refuses to delete your own account or the last
 * administrator; its message is shown as it is.
 */
export default function UsersPage() {
  const { roles, labelOf } = useRoles();
  const { userId } = useAuth();

  const config = useMemo<ResourceConfig<User>>(
    () => ({
      noun: 'user',
      plural: 'users',
      title: 'Users',
      subtitle: 'People who can sign in, and the role that decides what they can do.',
      endpoint: '/users',
      writePermission: 'users:manage',
      searchPlaceholder: 'Search by username or email',
      columns: [
        { key: 'username', header: 'Username', render: (u) => <strong>{u.username}</strong> },
        { key: 'email', header: 'Email', render: (u) => u.email },
        { key: 'role', header: 'Role', render: (u) => <Badge tone={u.isAdmin ? 'info' : 'neutral'}>{labelOf(u.role ?? (u.isAdmin ? 'ADMIN' : 'MEMBER'))}</Badge> },
        { key: 'createdAt', header: 'Created', render: (u) => formatDate(u.createdAt) }
      ],
      fields: [
        { name: 'username', label: 'Username', required: true, maxLength: 50, hint: 'At least 3 characters' },
        { name: 'email', label: 'Email', type: 'email', required: true, maxLength: 100 },
        {
          name: 'role',
          label: 'Role',
          type: 'select',
          required: true,
          initial: 'MEMBER',
          options: roles.map((r) => ({ value: r.key, label: r.label }))
        },
        { name: 'password', label: 'Password', type: 'password', required: true, createOnly: true, hint: 'At least 8 characters; set once here' }
      ],
      toForm: (u) => ({ username: u.username, email: u.email, role: u.role ?? (u.isAdmin ? 'ADMIN' : 'MEMBER') }),
      canDelete: (u) => u.id !== userId
    }),
    // labelOf is rebuilt every render but only ever changes when roles does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, userId]
  );

  return <ResourcePage config={config} />;
}
