import { useState, useEffect } from 'react';
import type { User } from '../../api/userApi';
import { createUser, updateUser } from '../../api/userApi';

interface AddUserFormProps {
  onUserAdded: (data?: any) => void;   // Works for both create and update
  initialData?: User | null;
  isEdit?: boolean;
}

export default function AddUserForm({ onUserAdded, initialData, isEdit = false }: AddUserFormProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    isAdmin: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        username: initialData.username || '',
        email: initialData.email || '',
        password: '',                    // Never prefill password
        isAdmin: initialData.isAdmin || false,
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEdit && initialData) {
        // For edit, don't send password unless user typed something
        const dataToSend: any = { ...formData };
        if (!dataToSend.password) delete dataToSend.password;

        await updateUser(initialData.id, dataToSend);
      } else {
        await createUser(formData);
      }

      // Reset form only on create
      if (!isEdit) {
        setFormData({ username: '', email: '', password: '', isAdmin: false });
      }

      onUserAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || (isEdit ? 'Failed to update user' : 'Failed to create user'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      backgroundColor: '#18181b', 
      padding: '24px', 
      borderRadius: '10px', 
      marginBottom: '28px',
      border: '1px solid #27272a'
    }}>
      <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600', color: '#f1f5f9' }}>
        {isEdit ? 'Edit User' : 'Add New User'}
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Username</label>
          <input 
            type="text" 
            name="username" 
            value={formData.username} 
            onChange={handleChange} 
            required 
            style={{ width: '100%', padding: '11px 14px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: 'white', fontSize: '14px' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Email Address</label>
          <input 
            type="email" 
            name="email" 
            value={formData.email} 
            onChange={handleChange} 
            required 
            style={{ width: '100%', padding: '11px 14px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: 'white', fontSize: '14px' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
            {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
          </label>
          <input 
            type="password" 
            name="password" 
            value={formData.password} 
            onChange={handleChange} 
            required={!isEdit}
            style={{ width: '100%', padding: '11px 14px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: 'white', fontSize: '14px' }} 
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input 
            type="checkbox" 
            name="isAdmin" 
            checked={formData.isAdmin} 
            onChange={handleChange} 
            style={{ accentColor: '#ec4899' }} 
          />
          <label style={{ color: '#d1d5db', fontSize: '14px' }}>Grant Administrator privileges</label>
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '14px' }}>{error}</p>}

        <button 
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
            padding: '11px 24px',
            background: 'linear-gradient(135deg, #ec4899, #c026d3)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            fontSize: '14.5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading 
            ? (isEdit ? 'Updating...' : 'Creating...') 
            : (isEdit ? 'Update User' : 'Create User')
          }
        </button>
      </form>
    </div>
  );
}