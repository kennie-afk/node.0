import { useState, useEffect } from 'react';
import type { User } from '../../api/userApi';
import { fetchUsers, deleteUser, updateUser } from '../../api/userApi';
import BackButton from '../../components/common/BackButton';
import AddUserForm from '../../components/forms/AddUserForm';
import { UserTable } from '../../components/tables/UserTable';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetchUsers();
      const data = response.data || response.users || [];
      setUsers(data);
      setFilteredUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = users.filter(user =>
      user.username.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const handleUserAdded = async () => {
    setSuccess('User created successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    await loadUsers();
  };

  const handleUpdateUser = async (updatedData: Partial<User>) => {
    if (!editingUser) return;
    try {
      await updateUser(editingUser.id, updatedData);
      setSuccess('User updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setShowEditForm(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await deleteUser(id);
      setSuccess('User deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowEditForm(true);
  };

  return (
    <div>
      <BackButton />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700' }}>Users Management</h1>
          <p style={{ color: '#a1a1aa' }}>Manage church administrators and staff</p>
        </div>

        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '12px 24px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New User'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
        <input
          type="text"
          placeholder="Search by username or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '14px 20px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '10px',
            color: '#f1f5f9',
            fontSize: '15px'
          }}
        />
        <button 
          style={{
            padding: '14px 28px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Search
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '12px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '12px', marginBottom: '20px' }}>{success}</div>}

      {showAddForm && <AddUserForm onUserAdded={handleUserAdded} />}

      {showEditForm && editingUser && (
        <AddUserForm 
          onUserAdded={handleUpdateUser} 
          initialData={editingUser}
          isEdit={true}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading users...</div>
      ) : (
        <div className="card">
          <UserTable users={filteredUsers} onDelete={handleDelete} onEdit={handleEdit} />
        </div>
      )}
    </div>
  );
}