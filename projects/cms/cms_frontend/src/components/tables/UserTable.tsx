import type { User } from '../../api/userApi';
import { Button } from '../common/Button';
import { useRoles } from '../../api/rolesApi';

interface Props {
  users: User[];
  onDelete: (id: number) => void;
  onEdit: (user: User) => void;
}

export const UserTable: React.FC<Props> = ({ users, onDelete, onEdit }) => {
  const { labelOf } = useRoles();
  if (users.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: 'var(--c-muted)' }}>No users found.</p>;
  }

  const sortedUsers = [...users].sort((a, b) => b.id - a.id);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: '600px' }} className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td><strong>{user.username}</strong></td>
              <td>{user.email}</td>
              <td>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  background: user.isAdmin ? 'var(--c-ok-bg)' : 'var(--c-fill)',
                  color: user.isAdmin ? 'var(--c-ok)' : 'var(--c-text)',
                  fontSize: '11.5px',
                  fontWeight: '500',
                  whiteSpace: 'nowrap'
                }}>
                  {labelOf(user.role ?? (user.isAdmin ? 'ADMIN' : 'MEMBER'))}
                </span>
              </td>
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              <td>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onEdit(user)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="danger" 
                    size="sm" 
                    onClick={() => onDelete(user.id)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};