import React, { useState, useEffect } from 'react';
import { createMinistry, updateMinistry } from '../../api/ministryApi';
import { fetchMembers } from '../../api/memberApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onMinistryAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
}

export default function AddMinistryForm({ onMinistryAdded, initialData, isEdit = false }: Props) {
  const [members, setMembers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    leaderId: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        leaderId: initialData.leaderId ? String(initialData.leaderId) : '',
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        leaderId: formData.leaderId ? parseInt(formData.leaderId) : undefined,
      };

      if (isEdit && initialData?.id) {
        await updateMinistry(initialData.id, payload);
      } else {
        await createMinistry(payload);
      }

      setFormData({ name: '', description: '', leaderId: '' });
      onMinistryAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save ministry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
        {isEdit ? 'Edit Ministry' : 'Add New Ministry'}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input placeholder="Ministry Name *" name="name" value={formData.name} onChange={handleChange} required />

        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Description (optional)"
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#f1f5f9',
            fontSize: '14px',
            minHeight: '100px'
          }}
        />

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
            Leader
          </label>
          <select
            name="leaderId"
            value={formData.leaderId}
            onChange={handleChange}
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px' }}
            required
          >
            <option value="">Select Leader</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </div>

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating...' : 'Adding Ministry...') : (isEdit ? 'Update Ministry' : 'Add Ministry')}
          </Button>

          <Button 
            type="button"
            onClick={() => window.history.back()}
            style={{ background: 'transparent', border: '1px solid #f1f5f9', color: '#f1f5f9', flex: 1 }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}