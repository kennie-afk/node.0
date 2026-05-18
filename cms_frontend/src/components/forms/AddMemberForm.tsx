import React, { useState, useEffect } from 'react';
import { createMember } from '../../api/memberApi';
import { fetchFamilies } from '../../api/familyApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onMemberAdded: () => void;
  initialData?: any;     // For edit mode
  isEdit?: boolean;
  onCancel?: () => void;
}

export const AddMemberForm: React.FC<Props> = ({ 
  onMemberAdded, 
  initialData, 
  isEdit = false, 
  onCancel 
}) => {
  const [families, setFamilies] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    gender: 'Male',
    familyId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load families for dropdown
  useEffect(() => {
    const loadFamilies = async () => {
      try {
        const res = await fetchFamilies();
        setFamilies(res.data || res || []);
      } catch (err) {
        console.error('Failed to load families', err);
      }
    };
    loadFamilies();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        firstName: initialData.firstName || '',
        lastName: initialData.lastName || '',
        email: initialData.email || '',
        phoneNumber: initialData.phoneNumber || '',
        dateOfBirth: initialData.dateOfBirth || '',
        gender: initialData.gender || 'Male',
        familyId: initialData.familyId ? String(initialData.familyId) : '',
      });
    }
  }, [initialData, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        ...formData,
        familyId: formData.familyId ? Number(formData.familyId) : null,
      };

      if (isEdit && initialData) {
        // Note: You'll need updateMember in memberApi for full edit support
        // For now we just call onMemberAdded to close form
        console.log('Update payload would be:', payload);
      } else {
        await createMember(payload);
      }

      // Reset form
      setFormData({
        firstName: '', lastName: '', email: '', phoneNumber: '', 
        dateOfBirth: '', gender: 'Male', familyId: ''
      });

      onMemberAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save member');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  return (
    <div className="card" style={{ marginBottom: '30px' }}>
      <h3>{isEdit ? 'Edit Member' : 'Add New Member'}</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input 
          placeholder="First Name *" 
          value={formData.firstName} 
          onChange={e => setFormData({...formData, firstName: e.target.value})} 
          required 
        />
        <Input 
          placeholder="Last Name *" 
          value={formData.lastName} 
          onChange={e => setFormData({...formData, lastName: e.target.value})} 
          required 
        />
        <Input 
          type="email" 
          placeholder="Email" 
          value={formData.email} 
          onChange={e => setFormData({...formData, email: e.target.value})} 
        />
        <Input 
          placeholder="Phone Number" 
          value={formData.phoneNumber} 
          onChange={e => setFormData({...formData, phoneNumber: e.target.value})} 
        />
        <Input 
          type="date" 
          placeholder="Date of Birth" 
          value={formData.dateOfBirth} 
          onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} 
        />

        <select 
          value={formData.gender} 
          onChange={e => setFormData({...formData, gender: e.target.value})}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#f1f5f9',
            fontSize: '14px'
          }}
        >
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>

        <select 
          value={formData.familyId} 
          onChange={e => setFormData({...formData, familyId: e.target.value})}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#f1f5f9',
            fontSize: '14px'
          }}
        >
          <option value="">Select Family (optional)</option>
          {families.map(f => (
            <option key={f.id} value={f.id}>{f.familyName}</option>
          ))}
        </select>

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ 
              background: 'linear-gradient(135deg, #ec4899, #c026d3)', 
              flex: 1 
            }}
          >
            {loading 
              ? (isEdit ? 'Updating Member...' : 'Adding Member...') 
              : (isEdit ? 'Update Member' : 'Add Member')
            }
          </Button>

          <Button 
            type="button"
            onClick={handleCancel}
            style={{ 
              background: 'transparent', 
              border: '1px solid #f1f5f9', 
              color: '#f1f5f9',
              flex: 1 
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};