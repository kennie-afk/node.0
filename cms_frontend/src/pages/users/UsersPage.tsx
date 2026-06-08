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
    setShowAddForm(false);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
    setEditingUser(null);
  };

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      <BackButton />

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px', 
        flexWrap: 'wrap', 
        gap: '16px' 
      }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', marginBottom: '4px' }}>Users Management</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage church administrators and staff</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingUser(null);
          }}
          style={{
            padding: '10px 20px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New User'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{success}</div>}

      {showAddForm && <AddUserForm onUserAdded={handleUserAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingUser && (
        <AddUserForm 
          onUserAdded={handleUpdateUser} 
          initialData={editingUser}
          isEdit={true}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '28px', 
            flexWrap: 'wrap',
            flexDirection: window.innerWidth < 500 ? 'column' : 'row'
          }}>
            <input
              type="text"
              placeholder="Search by username or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '12px 16px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
            <button 
              style={{
                padding: '12px 24px',
                background: '#ec4899',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                flexShrink: 0,
                width: window.innerWidth < 500 ? '100%' : 'auto'
              }}
            >
              Search
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a1a1aa' }}>Loading users...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <UserTable users={filteredUsers} onDelete={handleDelete} onEdit={handleEdit} />
            </div>
          )}
        </>
      )}
    </div>
  );
}