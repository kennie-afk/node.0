import React, { useState, useEffect } from 'react';
import { createFamily, updateFamily } from '../../api/familyApi';
import { fetchMembers } from '../../api/memberApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onFamilyAdded: (data?: any) => void;
  initialData?: any;
  isEdit?: boolean;
  onCancel?: () => void;        // ← Added for Cancel button
}

export const AddFamilyForm: React.FC<Props> = ({ 
  onFamilyAdded, 
  initialData, 
  isEdit = false,
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    familyName: '',
    address: '',
    city: '',
    county: '',
    postalCode: '',
    phoneNumber: '',
    email: '',
    notes: '',
    headOfFamilyMemberId: '',
  });

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load members for dropdown
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const response = await fetchMembers();
        setMembers(response.data || response || []);
      } catch (err) {
        console.error("Failed to load members", err);
      }
    };
    loadMembers();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        familyName: initialData.familyName || '',
        address: initialData.address || '',
        city: initialData.city || '',
        county: initialData.county || '',
        postalCode: initialData.postalCode || '',
        phoneNumber: initialData.phoneNumber || '',
        email: initialData.email || '',
        notes: initialData.notes || '',
        headOfFamilyMemberId: initialData.headOfFamilyMemberId ? initialData.headOfFamilyMemberId.toString() : '',
      });
    }
  }, [initialData, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        familyName: formData.familyName,
        address: formData.address,
        city: formData.city,
        county: formData.county,
        postalCode: formData.postalCode,
        phoneNumber: formData.phoneNumber,
        email: formData.email,
        notes: formData.notes,
        headOfFamilyMemberId: formData.headOfFamilyMemberId 
          ? parseInt(formData.headOfFamilyMemberId) 
          : null,
      };

      if (isEdit && initialData) {
        await updateFamily(initialData.id, payload);
      } else {
        await createFamily(payload);
      }

      onFamilyAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || (isEdit ? 'Failed to update family' : 'Failed to create family'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      // Reset form
      setFormData({
        familyName: '', address: '', city: '', county: '', postalCode: '',
        phoneNumber: '', email: '', notes: '', headOfFamilyMemberId: ''
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="card" style={{ marginBottom: '30px' }}>
      <h3>{isEdit ? 'Edit Family' : 'Add New Family'}</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input 
          placeholder="Family Name *" 
          name="familyName"
          value={formData.familyName} 
          onChange={handleChange} 
          required 
        />

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
            Head of Family (Member)
          </label>
          <select
            name="headOfFamilyMemberId"
            value={formData.headOfFamilyMemberId}
            onChange={handleChange}
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
            <option value="">Select Head of Family (optional)</option>
            {members.map((member: any) => (
              <option key={member.id} value={member.id}>
                {member.firstName} {member.lastName}
              </option>
            ))}
          </select>
        </div>

        <Input placeholder="Address" name="address" value={formData.address} onChange={handleChange} />
        <Input placeholder="City" name="city" value={formData.city} onChange={handleChange} />
        <Input placeholder="County" name="county" value={formData.county} onChange={handleChange} />
        <Input placeholder="Postal Code" name="postalCode" value={formData.postalCode} onChange={handleChange} />
        <Input placeholder="Phone Number" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} />
        <Input type="email" placeholder="Email" name="email" value={formData.email} onChange={handleChange} />
        <Input placeholder="Notes (optional)" name="notes" value={formData.notes} onChange={handleChange} />

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
            {loading ? (isEdit ? 'Updating...' : 'Adding Family...') : (isEdit ? 'Update Family' : 'Add Family')}
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