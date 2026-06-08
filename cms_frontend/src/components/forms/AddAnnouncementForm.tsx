import React, { useState, useEffect } from 'react';
import { createAnnouncement, updateAnnouncement } from '../../api/announcementApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onAnnouncementAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
  onCancel?: () => void;
}

export default function AddAnnouncementForm({ 
  onAnnouncementAdded, 
  initialData, 
  isEdit = false,
  onCancel
}: Props) {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    publicationDate: '',
    expiryDate: '',
    isPublished: true,
    targetAudience: 'All',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        title: initialData.title || '',
        content: initialData.content || '',
        publicationDate: initialData.publicationDate 
          ? initialData.publicationDate.slice(0, 16) 
          : '',
        expiryDate: initialData.expiryDate 
          ? initialData.expiryDate.slice(0, 16) 
          : '',
        isPublished: initialData.isPublished ?? true,
        targetAudience: initialData.targetAudience || 'All',
      });
    }
  }, [initialData, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        title: formData.title,
        content: formData.content,
        publicationDate: formData.publicationDate 
          ? `${formData.publicationDate}:00Z` 
          : undefined,
        expiryDate: formData.expiryDate 
          ? `${formData.expiryDate}:00Z` 
          : undefined,
        isPublished: formData.isPublished,
        targetAudience: formData.targetAudience,
      };

      if (isEdit && initialData?.id) {
        await updateAnnouncement(initialData.id, payload);
      } else {
        await createAnnouncement(payload);
      }

      setFormData({
        title: '',
        content: '',
        publicationDate: '',
        expiryDate: '',
        isPublished: true,
        targetAudience: 'All',
      });

      onAnnouncementAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save announcement');
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
    <div className="card" style={{ marginBottom: '28px', maxWidth: '800px', marginLeft: 'auto', marginRight: 'auto' }}>
      <h3 style={{ marginBottom: '20px', fontSize: 'clamp(18px, 4vw, 20px)', fontWeight: '600' }}>
        {isEdit ? 'Edit Announcement' : 'Add New Announcement'}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          placeholder="Title *"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
        />

        <textarea
          name="content"
          value={formData.content}
          onChange={handleChange}
          placeholder="Content *"
          required
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#f1f5f9',
            fontSize: '14px',
            minHeight: '120px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
          gap: '16px' 
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
              Publication Date
            </label>
            <input
              type="datetime-local"
              name="publicationDate"
              value={formData.publicationDate}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                color: '#f1f5f9',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
              Expiry Date (optional)
            </label>
            <input
              type="datetime-local"
              name="expiryDate"
              value={formData.expiryDate}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                color: '#f1f5f9',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
            Target Audience
          </label>
          <select
            name="targetAudience"
            value={formData.targetAudience}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              color: '#f1f5f9',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          >
            <option value="All">All</option>
            <option value="Members">Members</option>
            <option value="Visitors">Visitors</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            name="isPublished"
            checked={formData.isPublished}
            onChange={handleChange}
            style={{ accentColor: '#ec4899' }}
          />
          <label style={{ color: '#d1d5db', fontSize: '14px' }}>Publish immediately</label>
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '14px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexDirection: window.innerWidth < 500 ? 'column' : 'row' }}>
          <Button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #ec4899, #c026d3)',
              flex: 1,
              padding: '12px'
            }}
          >
            {loading 
              ? (isEdit ? 'Updating...' : 'Creating...') 
              : (isEdit ? 'Update Announcement' : 'Create Announcement')
            }
          </Button>

          <Button
            type="button"
            onClick={handleCancel}
            style={{
              background: 'transparent',
              border: '1px solid #f1f5f9',
              color: '#f1f5f9',
              flex: 1,
              padding: '12px'
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}