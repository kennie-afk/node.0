import type { User } from '../../api/userApi';
import { Button } from '../common/Button';

interface Props {
  users: User[];
  onDelete: (id: number) => void;
  onEdit: (user: User) => void;
}

export const UserTable: React.FC<Props> = ({ users, onDelete, onEdit }) => {
  if (users.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No users found.</p>;
  }

  const sortedUsers = [...users].sort((a, b) => b.id - a.id);

  return (
    <table className="table">
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
                borderRadius: '9999px',
                background: user.isAdmin ? '#dbeafe' : '#f3e8ff',
                color: user.isAdmin ? '#1e40af' : '#6b21a8',
                fontSize: '13px'
              }}>
                {user.isAdmin ? 'Admin' : 'User'}
              </span>
            </td>
            <td>{new Date(user.createdAt).toLocaleDateString()}</td>
            <td style={{ display: 'flex', gap: '8px' }}>
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};