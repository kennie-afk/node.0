import React, { useState, useEffect } from 'react';
import { createSermon, updateSermon } from '../../api/sermonApi';
import { fetchMembers } from '../../api/memberApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onSermonAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
}

export default function AddSermonForm({ onSermonAdded, initialData, isEdit = false }: Props) {
  const [members, setMembers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    datePreached: '',
    speakerMemberId: '',
    isGuestSpeaker: false,
    guestSpeakerName: '',
    passageReference: '',
    summary: '',
    audioUrl: '',
    videoUrl: '',
    notes: '',
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
        title: initialData.title || '',
        content: initialData.content || '',
        datePreached: initialData.datePreached ? initialData.datePreached.slice(0, 10) : '',
        speakerMemberId: initialData.speakerMemberId ? String(initialData.speakerMemberId) : '',
        isGuestSpeaker: !initialData.speakerMemberId && !!initialData.guestSpeakerName,
        guestSpeakerName: initialData.guestSpeakerName || '',
        passageReference: initialData.passageReference || '',
        summary: initialData.summary || '',
        audioUrl: initialData.audioUrl || '',
        videoUrl: initialData.videoUrl || '',
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

    try {
      const datePreachedISO = formData.datePreached 
        ? `${formData.datePreached}T00:00:00Z` 
        : undefined;

      const payload: any = {
        title: formData.title,
        datePreached: datePreachedISO,
        passageReference: formData.passageReference || undefined,
        summary: formData.summary || undefined,
        audioUrl: formData.audioUrl || undefined,
        videoUrl: formData.videoUrl || undefined,
        notes: formData.notes || undefined,
      };

      if (formData.content) payload.content = formData.content;

      if (formData.isGuestSpeaker && formData.guestSpeakerName.trim()) {
        payload.guestSpeakerName = formData.guestSpeakerName.trim();
        payload.speakerMemberId = undefined;
      } else if (formData.speakerMemberId) {
        payload.speakerMemberId = parseInt(formData.speakerMemberId);
        payload.guestSpeakerName = undefined;
      }

      if (isEdit && initialData?.id) {
        await updateSermon(initialData.id, payload);
      } else {
        await createSermon(payload);
      }

      setFormData({
        title: '', content: '', datePreached: '', speakerMemberId: '',
        isGuestSpeaker: false, guestSpeakerName: '',
        passageReference: '', summary: '', audioUrl: '', videoUrl: '', notes: ''
      });

      onSermonAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save sermon');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '28px' }}>
      <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
        {isEdit ? 'Edit Sermon' : 'Add New Sermon'}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input placeholder="Sermon Title *" name="title" value={formData.title} onChange={handleChange} required />

        <textarea
          name="content"
          value={formData.content}
          onChange={handleChange}
          placeholder="Full Sermon Content"
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#f1f5f9',
            fontSize: '14px',
            minHeight: '160px',
            resize: 'vertical'
          }}
        />

        <Input 
          placeholder="Date Preached *" 
          name="datePreached" 
          value={formData.datePreached} 
          onChange={handleChange} 
          type="date" 
          required 
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input 
            type="checkbox" 
            name="isGuestSpeaker" 
            checked={formData.isGuestSpeaker} 
            onChange={handleChange}
            style={{ accentColor: '#ec4899' }}
          />
          <label style={{ color: '#d1d5db', fontSize: '14px' }}>This is a Guest Speaker (not a church member)</label>
        </div>

        {!formData.isGuestSpeaker ? (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
              Speaker (Church Member)
            </label>
            <select
              name="speakerMemberId"
              value={formData.speakerMemberId}
              onChange={handleChange}
              style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px' }}
            >
              <option value="">Select Speaker</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <Input 
            placeholder="Guest Speaker Full Name *" 
            name="guestSpeakerName" 
            value={formData.guestSpeakerName} 
            onChange={handleChange} 
            required={formData.isGuestSpeaker}
          />
        )}

        <Input placeholder="Passage Reference (e.g. John 3:16)" name="passageReference" value={formData.passageReference} onChange={handleChange} />

        <textarea
          name="summary"
          value={formData.summary}
          onChange={handleChange}
          placeholder="Short Summary (optional)"
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

        <Input placeholder="Audio URL (optional)" name="audioUrl" value={formData.audioUrl} onChange={handleChange} type="url" />
        <Input placeholder="Video URL (optional)" name="videoUrl" value={formData.videoUrl} onChange={handleChange} type="url" />
        <Input placeholder="Notes (optional)" name="notes" value={formData.notes} onChange={handleChange} />

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating...' : 'Adding Sermon...') : (isEdit ? 'Update Sermon' : 'Add Sermon')}
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