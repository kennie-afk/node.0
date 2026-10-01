import { useState, useEffect } from 'react';
import type { User } from '../../api/userApi';
import { createUser, updateUser } from '../../api/userApi';
import { describeError } from '../../api/errors';
import { useRoles } from '../../api/rolesApi';

interface AddUserFormProps {
  onUserAdded: (data?: any) => void;
  initialData?: User | null;
  isEdit?: boolean;
  onCancel?: () => void;
}

export default function AddUserForm({ onUserAdded, initialData, isEdit = false, onCancel }: AddUserFormProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'MEMBER',
  });
  const { roles } = useRoles();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        username: initialData.username || '',
        email: initialData.email || '',
        password: '',
        role: initialData.role ?? (initialData.isAdmin ? 'ADMIN' : 'MEMBER'),
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEdit && initialData) {
        const dataToSend: any = { ...formData };
        if (!dataToSend.password) delete dataToSend.password;
        await updateUser(initialData.id, dataToSend);
      } else {
        await createUser(formData);
      }

      if (!isEdit) {
        setFormData({ username: '', email: '', password: '', role: 'MEMBER' });
      }

      onUserAdded();
    } catch (err: any) {
      setError(describeError(err, (isEdit ? 'Failed to update user' : 'Failed to create user')));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div style={{ 
      backgroundColor: 'var(--c-surface)', 
      padding: 'clamp(16px, 4vw, 24px)', 
      borderRadius: '6px', 
      marginBottom: '28px',
      border: '1px solid var(--c-border)',
      maxWidth: '800px',
      marginLeft: 'auto',
      marginRight: 'auto'
    }}>
      <h2 style={{ marginBottom: '20px', fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>
        {isEdit ? 'Edit User' : 'Add New User'}
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '12px' }}>Username</label>
          <input 
            type="text" 
            name="username" 
            value={formData.username} 
            onChange={handleChange} 
            required 
            style={{ width: '100%', padding: '12px 16px', backgroundColor: 'var(--c-fill)', border: '1px solid var(--c-border-strong)', borderRadius: '6px', color: 'var(--c-text)', fontSize: '12px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '12px' }}>Email Address</label>
          <input 
            type="email" 
            name="email" 
            value={formData.email} 
            onChange={handleChange} 
            required 
            style={{ width: '100%', padding: '12px 16px', backgroundColor: 'var(--c-fill)', border: '1px solid var(--c-border-strong)', borderRadius: '6px', color: 'var(--c-text)', fontSize: '12px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '12px' }}>
            {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
          </label>
          <input 
            type="password" 
            name="password" 
            value={formData.password} 
            onChange={handleChange} 
            required={!isEdit}
            style={{ width: '100%', padding: '12px 16px', backgroundColor: 'var(--c-fill)', border: '1px solid var(--c-border-strong)', borderRadius: '6px', color: 'var(--c-text)', fontSize: '12px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label htmlFor="user-role" style={{ display: 'block', marginBottom: '6px', color: 'var(--c-text-2)', fontSize: '12px', fontWeight: 500 }}>Role</label>
          <select
            id="user-role"
            name="role"
            value={formData.role}
            onChange={handleChange}
            style={{ width: '100%', padding: '12px 16px', backgroundColor: 'var(--c-fill)', border: '1px solid var(--c-border-strong)', borderRadius: '6px', color: 'var(--c-text)', fontSize: '12px', boxSizing: 'border-box' }}
          >
            {/* Until the list arrives, keep the current value selectable so an edit never blanks the role. */}
            {roles.length === 0 && <option value={formData.role}>{formData.role}</option>}
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {error && <p style={{ color: 'var(--c-bad)', fontSize: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexDirection: window.innerWidth < 500 ? 'column' : 'row' }}>
          <button 
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '12px 24px',
              background: 'var(--c-accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              flex: 1
            }}
          >
            {loading 
              ? (isEdit ? 'Updating...' : 'Creating...') 
              : (isEdit ? 'Update User' : 'Create User')
            }
          </button>

          <button 
            type="button"
            onClick={handleCancel}
            style={{
              marginTop: '8px',
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid var(--c-text)',
              color: 'var(--c-text)',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              flex: 1
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}