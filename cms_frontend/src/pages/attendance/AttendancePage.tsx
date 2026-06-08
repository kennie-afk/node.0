import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAttendance, deleteAttendance } from '../../api/attendanceApi';
import BackButton from '../../components/common/BackButton';
import AddAttendanceForm from '../../components/forms/AddAttendanceForm';
import { AttendanceTable } from '../../components/tables/AttendanceTable';

export default function AttendancePage() {
  const location = useLocation();

  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  const getActiveTab = () => {
    if (location.pathname.includes('/attendance/event')) return 'event';
    if (location.pathname.includes('/attendance/sermon')) return 'sermon';
    return 'general';
  };

  const [activeTab, setActiveTab] = useState<'general' | 'event' | 'sermon'>(getActiveTab());

  const [showEventModal, setShowEventModal] = useState(false);
  const [showSermonModal, setShowSermonModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedSermon, setSelectedSermon] = useState<any>(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetchAttendance();
      setAttendance(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceAdded = () => {
    setSuccess('Attendance recorded successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    setEditingRecord(null);
    loadAttendance();
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    setShowAddForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await deleteAttendance(id);
      setSuccess('Record deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadAttendance();
    } catch (err: any) {
      setError('Failed to delete record');
    }
  };

  const handleViewEvent = (eventId: number) => {
    const event = attendance.find(a => a.eventId === eventId)?.attendedEvent;
    if (event) {
      setSelectedEvent(event);
      setShowEventModal(true);
    }
  };

  const handleViewSermon = (sermonId: number) => {
    const sermon = attendance.find(a => a.sermonId === sermonId)?.attendedSermon;
    if (sermon) {
      setSelectedSermon(sermon);
      setShowSermonModal(true);
    }
  };

  const closeModals = () => {
    setShowEventModal(false);
    setShowSermonModal(false);
    setSelectedEvent(null);
    setSelectedSermon(null);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingRecord(null);
  };

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      <BackButton />

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', margin: 0 }}>Attendance</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Record and manage church attendance</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingRecord(null);
          }}
          style={{
            padding: '10px 20px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Record Attendance'}
        </button>
      </div>

      <div style={{ 
        display: 'flex', 
        background: '#18181b', 
        borderRadius: '8px', 
        padding: '6px', 
        marginBottom: '28px',
        width: 'fit-content',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance')}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            background: activeTab === 'general' ? '#ec4899' : 'transparent',
            color: activeTab === 'general' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          General
        </button>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance/event')}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            background: activeTab === 'event' ? '#ec4899' : 'transparent',
            color: activeTab === 'event' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          Events
        </button>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance/sermon')}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            background: activeTab === 'sermon' ? '#ec4899' : 'transparent',
            color: activeTab === 'sermon' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          Sermons
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{success}</div>}

      {showAddForm && (
        <AddAttendanceForm 
          onAttendanceAdded={handleAttendanceAdded} 
          initialData={editingRecord} 
          isEdit={!!editingRecord} 
          activeTab={activeTab}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading attendance records...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <AttendanceTable 
                attendance={attendance} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onViewEvent={handleViewEvent}
                onViewSermon={handleViewSermon}
                activeTab={activeTab}
              />
            </div>
          )}
        </>
      )}

      {showEventModal && selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>{selectedEvent.name}</h3>
              <button onClick={closeModals} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                Close
              </button>
            </div>
            <div style={{ color: '#cbd5e1', lineHeight: '1.8' }}>
              <p><strong>Date & Time:</strong> {new Date(selectedEvent.startTime).toLocaleString()}</p>
              {selectedEvent.endTime && <p><strong>End Time:</strong> {new Date(selectedEvent.endTime).toLocaleString()}</p>}
              {selectedEvent.location && <p><strong>Location:</strong> {selectedEvent.location}</p>}
              {selectedEvent.description && <p><strong>Description:</strong> {selectedEvent.description}</p>}
            </div>
          </div>
        </div>
      )}

      {showSermonModal && selectedSermon && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>{selectedSermon.title}</h3>
              <button onClick={closeModals} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                Close
              </button>
            </div>
            <div style={{ color: '#cbd5e1', lineHeight: '1.8' }}>
              <p><strong>Date Preached:</strong> {new Date(selectedSermon.datePreached).toLocaleDateString()}</p>
              {selectedSermon.content && <p><strong>Content:</strong> {selectedSermon.content}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}