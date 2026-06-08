import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAttendance, deleteAttendance } from '../../api/attendanceApi';
import AddAttendanceForm from '../../components/forms/AddAttendanceForm';
import { AttendanceTable } from '../../components/tables/AttendanceTable';

export default function AttendancePage() {
  const location = useLocation();

  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setEditingRecord(null);
    loadAttendance();
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
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

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: 'clamp(26px, 5.5vw, 32px)', fontWeight: '700', margin: 0 }}>Attendance</h1>
          <p style={{ color: '#a1a1aa', margin: '4px 0 0 0' }}>Record and manage church attendance</p>
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        background: '#18181b', 
        borderRadius: '12px', 
        padding: '6px', 
        marginBottom: '28px',
        width: 'fit-content',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance')}
          style={{
            padding: '10px 24px',
            borderRadius: '8px',
            background: activeTab === 'general' ? '#ec4899' : 'transparent',
            color: activeTab === 'general' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          General
        </button>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance/event')}
          style={{
            padding: '10px 24px',
            borderRadius: '8px',
            background: activeTab === 'event' ? '#ec4899' : 'transparent',
            color: activeTab === 'event' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Events
        </button>
        <button 
          onClick={() => window.history.pushState(null, '', '/attendance/sermon')}
          style={{
            padding: '10px 24px',
            borderRadius: '8px',
            background: activeTab === 'sermon' ? '#ec4899' : 'transparent',
            color: activeTab === 'sermon' ? 'white' : '#cbd5e1',
            border: 'none',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Sermons
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '12px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '12px', marginBottom: '20px' }}>{success}</div>}

      <AddAttendanceForm 
        onAttendanceAdded={handleAttendanceAdded} 
        initialData={editingRecord} 
        isEdit={!!editingRecord} 
        activeTab={activeTab}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>Loading attendance records...</div>
      ) : (
        <div className="card">
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

      {showEventModal && selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
              <h3>{selectedEvent.name}</h3>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
              <h3>{selectedSermon.title}</h3>
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