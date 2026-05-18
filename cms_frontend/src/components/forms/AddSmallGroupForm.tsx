import React, { useState, useEffect } from 'react';
import { createSmallGroup, updateSmallGroup } from '../../api/smallGroupApi';
import { fetchMinistries } from '../../api/ministryApi';
import { fetchMembers } from '../../api/memberApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onSmallGroupAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AddSmallGroupForm({ onSmallGroupAdded, initialData, isEdit = false }: Props) {
  const [ministries, setMinistries] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    ministryId: '',
    leaderId: '',
    description: '',
    meetingDay: '',
    meetingTime: '',
    meetingLocation: '',
    isActive: true,
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [minRes, memRes] = await Promise.all([fetchMinistries(), fetchMembers()]);
        setMinistries(minRes.data || minRes || []);
        setMembers(memRes.data || memRes || []);
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        name: initialData.name || '',
        ministryId: initialData.ministryId ? String(initialData.ministryId) : '',
        leaderId: initialData.leaderId ? String(initialData.leaderId) : '',
        description: initialData.description || '',
        meetingDay: initialData.meetingDay || '',
        meetingTime: initialData.meetingTime || '',
        meetingLocation: initialData.meetingLocation || '',
        isActive: initialData.isActive !== undefined ? initialData.isActive : true,
        notes: initialData.notes || '',
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Client-side validation
    if (formData.name.trim().length < 3) {
      setError("Small group name must be at least 3 characters long.");
      setLoading(false);
      return;
    }
    if (!formData.ministryId) {
      setError("Please select a ministry.");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        ministryId: parseInt(formData.ministryId),
        leaderId: formData.leaderId ? parseInt(formData.leaderId) : undefined,
        description: formData.description.trim() || undefined,
        meetingDay: formData.meetingDay || undefined,
        meetingTime: formData.meetingTime || undefined,
        meetingLocation: formData.meetingLocation.trim() || undefined,
        isActive: formData.isActive,
        notes: formData.notes.trim() || undefined,
      };

      if (isEdit && initialData?.id) {
        await updateSmallGroup(initialData.id, payload);
      } else {
        await createSmallGroup(payload);
      }

      setFormData({ 
        name: '', ministryId: '', leaderId: '', description: '', 
        meetingDay: '', meetingTime: '', meetingLocation: '', 
        isActive: true, notes: '' 
      });
      onSmallGroupAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save small group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
        {isEdit ? 'Edit Small Group' : 'Add New Small Group'}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input placeholder="Small Group Name *" name="name" value={formData.name} onChange={handleChange} required />

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Ministry *</label>
          <select 
            name="ministryId" 
            value={formData.ministryId} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9' }} 
            required
          >
            <option value="">Select Ministry</option>
            {ministries.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Leader</label>
          <select 
            name="leaderId" 
            value={formData.leaderId} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9' }}
          >
            <option value="">Select Leader (optional)</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Meeting Day</label>
          <select 
            name="meetingDay" 
            value={formData.meetingDay} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9' }}
          >
            <option value="">Select Day</option>
            {DAYS_OF_WEEK.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>Meeting Time</label>
          <input 
            type="time" 
            name="meetingTime" 
            value={formData.meetingTime} 
            onChange={handleChange}
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9' }}
          />
        </div>

        <Input placeholder="Meeting Location" name="meetingLocation" value={formData.meetingLocation} onChange={handleChange} />

        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Description (optional)"
          style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', minHeight: '80px' }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d1d5db' }}>
          <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} />
          Group is Active
        </label>

        <Input placeholder="Notes (optional)" name="notes" value={formData.notes} onChange={handleChange} />

        {error && <p style={{ color: '#f87171', marginTop: '4px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating...' : 'Adding...') : (isEdit ? 'Update Small Group' : 'Add Small Group')}
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