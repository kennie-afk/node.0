import React, { useState, useEffect } from 'react';
import { createEvent, updateEvent } from '../../api/eventApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onEventAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
}

export default function AddEventForm({ onEventAdded, initialData, isEdit = false }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    location: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        startTime: initialData.startTime ? initialData.startTime.slice(0, 16) : '',
        endTime: initialData.endTime ? initialData.endTime.slice(0, 16) : '',
        location: initialData.location || '',
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEdit && initialData) {
        await updateEvent(initialData.id, formData);
      } else {
        await createEvent(formData);
      }

      setFormData({ name: '', description: '', startTime: '', endTime: '', location: '' });
      onEventAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '30px' }}>
      <h3>{isEdit ? 'Edit Event' : 'Add New Event'}</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input 
          placeholder="Event Name *" 
          name="name" 
          value={formData.name} 
          onChange={handleChange} 
          required 
        />

        <textarea 
          name="description" 
          value={formData.description} 
          onChange={handleChange} 
          placeholder="Description (optional)"
          style={{
            width: '100%',
            padding: '14px 18px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            color: 'white',
            fontSize: '15px',
            minHeight: '80px',
            resize: 'vertical'
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Input 
            type="datetime-local" 
            placeholder="Start Time *" 
            name="startTime" 
            value={formData.startTime} 
            onChange={handleChange} 
            required 
          />
          <Input 
            type="datetime-local" 
            placeholder="End Time" 
            name="endTime" 
            value={formData.endTime} 
            onChange={handleChange} 
          />
        </div>

        <Input 
          placeholder="Location" 
          name="location" 
          value={formData.location} 
          onChange={handleChange} 
        />

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating Event...' : 'Creating Event...') : (isEdit ? 'Update Event' : 'Create Event')}
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