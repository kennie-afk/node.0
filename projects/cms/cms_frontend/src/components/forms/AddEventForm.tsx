import React, { useState, useEffect } from 'react';
import { createEvent, updateEvent } from '../../api/eventApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { describeError } from '../../api/errors';

interface Props {
  onEventAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
  onCancel?: () => void;
}

export default function AddEventForm({ onEventAdded, initialData, isEdit = false, onCancel }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    location: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError(describeError(err, 'Failed to save event'));
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
    <div className="card" style={{ marginBottom: '30px', maxWidth: '800px', marginLeft: 'auto', marginRight: 'auto' }}>
      <h3 style={{ fontSize: '13px', fontWeight: '600' }}>{isEdit ? 'Edit Event' : 'Add New Event'}</h3>

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
            padding: '12px 16px',
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '12px',
            minHeight: '80px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
          gap: '16px' 
        }}>
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

        {error && <p style={{ color: 'var(--c-bad)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexDirection: window.innerWidth < 500 ? 'column' : 'row' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'var(--c-accent)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating Event...' : 'Creating Event...') : (isEdit ? 'Update Event' : 'Create Event')}
          </Button>

          <Button 
            type="button"
            onClick={handleCancel}
            style={{ 
              background: 'transparent', 
              border: '1px solid var(--c-text)', 
              color: 'var(--c-text)',
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