import React, { useState, useEffect } from 'react';
import { createContribution, updateContribution } from '../../api/contributionApi';
import { fetchMembers } from '../../api/memberApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onContributionAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
}

export default function AddContributionForm({ onContributionAdded, initialData, isEdit = false }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    memberId: '',
    amount: '',
    date: '',
    contributionType: 'Tithe',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load members
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await fetchMembers();
        setMembers(res.data || res || []);
      } catch (err) {
        console.error('Failed to load members', err);
      }
    };
    loadMembers();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        memberId: initialData.memberId ? String(initialData.memberId) : '',
        amount: initialData.amount ? String(initialData.amount) : '',
        date: initialData.date ? initialData.date.split('T')[0] : '',
        contributionType: initialData.contributionType || 'Tithe',
        notes: initialData.notes || '',
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
      const fullDateTime = formData.date ? `${formData.date}T00:00:00Z` : '';

      if (isEdit && initialData) {
        await updateContribution(initialData.id, {
          memberId: Number(formData.memberId),
          amount: Number(formData.amount),
          date: fullDateTime,
          contributionType: formData.contributionType,
          notes: formData.notes || undefined,
        });
      } else {
        await createContribution({
          memberId: Number(formData.memberId),
          amount: Number(formData.amount),
          date: fullDateTime,
          contributionType: formData.contributionType,
          notes: formData.notes || undefined,
        });
      }

      setFormData({
        memberId: '',
        amount: '',
        date: '',
        contributionType: 'Tithe',
        notes: '',
      });

      onContributionAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save contribution');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '30px' }}>
      <h3>{isEdit ? 'Edit Contribution' : 'Record New Contribution'}</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <select 
          name="memberId" 
          value={formData.memberId} 
          onChange={handleChange}
          required
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
          <option value="">Select Member *</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </select>

        <Input 
          type="number" 
          placeholder="Amount (KES) *" 
          name="amount" 
          value={formData.amount} 
          onChange={handleChange} 
          required 
        />

        <Input 
          type="date" 
          placeholder="Contribution Date *" 
          name="date" 
          value={formData.date} 
          onChange={handleChange} 
          required 
        />

        <select 
          name="contributionType" 
          value={formData.contributionType} 
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
          <option value="Tithe">Tithe</option>
          <option value="Offering">Offering</option>
          <option value="Special">Special Offering</option>
          <option value="Thanksgiving">Thanksgiving</option>
        </select>

        <Input 
          placeholder="Notes (optional)" 
          name="notes" 
          value={formData.notes} 
          onChange={handleChange} 
        />

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating...' : 'Recording...') : (isEdit ? 'Update Contribution' : 'Record Contribution')}
          </Button>

          <Button 
            type="button"
            onClick={() => window.history.back()}
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
}