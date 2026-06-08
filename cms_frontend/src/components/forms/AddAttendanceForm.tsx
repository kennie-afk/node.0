import React, { useState, useEffect } from 'react';
import { createAttendance, updateAttendance } from '../../api/attendanceApi';
import { fetchMembers } from '../../api/memberApi';
import { fetchEvents } from '../../api/eventApi';
import { fetchSermons } from '../../api/sermonApi';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface Props {
  onAttendanceAdded: () => void;
  initialData?: any;
  isEdit?: boolean;
  activeTab?: 'general' | 'event' | 'sermon';
  onCancel?: () => void;
}

export default function AddAttendanceForm({ 
  onAttendanceAdded, 
  initialData, 
  isEdit = false,
  activeTab = 'general',
  onCancel
}: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [sermons, setSermons] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    memberId: '',
    guestName: '',
    attendanceDate: '',
    eventId: '',
    sermonId: '',
    attendanceType: 'In-person' as 'In-person' | 'Online' | 'Other',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const [mRes, eRes, sRes] = await Promise.all([
          fetchMembers(),
          fetchEvents(),
          fetchSermons(),
        ]);
        setMembers(mRes.data || mRes || []);
        setEvents(eRes.data || eRes || []);
        setSermons(sRes.data || sRes || []);
      } catch (err) {
        console.error('Failed to load dropdowns', err);
      }
    };
    loadDropdowns();
  }, []);

  useEffect(() => {
    if (initialData && isEdit) {
      setFormData({
        memberId: initialData.memberId ? String(initialData.memberId) : '',
        guestName: initialData.guestName || '',
        attendanceDate: initialData.attendanceDate ? initialData.attendanceDate.slice(0, 10) : '',
        eventId: initialData.eventId ? String(initialData.eventId) : '',
        sermonId: initialData.sermonId ? String(initialData.sermonId) : '',
        attendanceType: initialData.attendanceType || 'In-person',
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
      const payload = {
        memberId: formData.memberId ? parseInt(formData.memberId) : null,
        guestName: formData.guestName || null,
        attendanceDate: formData.attendanceDate,
        eventId: formData.eventId ? parseInt(formData.eventId) : null,
        sermonId: formData.sermonId ? parseInt(formData.sermonId) : null,
        attendanceType: formData.attendanceType,
        notes: formData.notes || null,
      };

      if (isEdit && initialData?.id) {
        await updateAttendance(initialData.id, payload);
      } else {
        await createAttendance(payload);
      }

      setFormData({ memberId: '', guestName: '', attendanceDate: '', eventId: '', sermonId: '', attendanceType: 'In-person', notes: '' });
      onAttendanceAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record attendance');
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
        {isEdit ? 'Edit Attendance Record' : `Record ${activeTab === 'event' ? 'Event' : activeTab === 'sermon' ? 'Sermon' : 'General'} Attendance`}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
            Member (optional)
          </label>
          <select
            name="memberId"
            value={formData.memberId}
            onChange={handleChange}
            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', boxSizing: 'border-box' }}
          >
            <option value="">Select Member</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </div>

        <Input 
          placeholder="Guest Name (if not a member)" 
          name="guestName" 
          value={formData.guestName} 
          onChange={handleChange} 
        />

        <Input 
          placeholder="Attendance Date *" 
          name="attendanceDate" 
          value={formData.attendanceDate} 
          onChange={handleChange} 
          type="date" 
          required 
        />

        {(activeTab === 'general' || activeTab === 'event') && (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
              Event (optional)
            </label>
            <select
              name="eventId"
              value={formData.eventId}
              onChange={handleChange}
              style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', boxSizing: 'border-box' }}
            >
              <option value="">Select Event</option>
              {events.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {(activeTab === 'general' || activeTab === 'sermon') && (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: '#a1a1aa', fontSize: '13.5px' }}>
              Sermon (optional)
            </label>
            <select
              name="sermonId"
              value={formData.sermonId}
              onChange={handleChange}
              style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', boxSizing: 'border-box' }}
            >
              <option value="">Select Sermon</option>
              {sermons.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <select
          name="attendanceType"
          value={formData.attendanceType}
          onChange={handleChange}
          style={{ width: '100%', padding: '12px 16px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', boxSizing: 'border-box' }}
        >
          <option value="In-person">In-person</option>
          <option value="Online">Online</option>
          <option value="Other">Other</option>
        </select>

        <Input 
          placeholder="Notes (optional)" 
          name="notes" 
          value={formData.notes} 
          onChange={handleChange} 
        />

        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexDirection: window.innerWidth < 500 ? 'column' : 'row' }}>
          <Button 
            type="submit" 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #ec4899, #c026d3)', flex: 1 }}
          >
            {loading ? (isEdit ? 'Updating...' : 'Recording...') : (isEdit ? 'Update Attendance' : 'Record Attendance')}
          </Button>

          <Button 
            type="button"
            onClick={handleCancel}
            style={{ background: 'transparent', border: '1px solid #f1f5f9', color: '#f1f5f9', flex: 1 }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}