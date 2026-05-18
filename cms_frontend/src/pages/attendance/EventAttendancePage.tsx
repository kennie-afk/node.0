// src/pages/attendance/EventAttendancePage.tsx
import { useState, useEffect } from 'react';
import { fetchAttendance, deleteAttendance } from '../../api/attendanceApi';
import AddAttendanceForm from '../../components/forms/AddAttendanceForm';
import { AttendanceTable } from '../../components/tables/AttendanceTable';

export default function EventAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetchAttendance();
      const eventOnly = (res.data || res || []).filter((a: any) => a.eventId !== null);
      setAttendance(eventOnly);
    } catch (err: any) {
      setError('Failed to load event attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceAdded = () => {
    setSuccess('Event attendance recorded successfully');
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

  const closeModals = () => {
    setShowEventModal(false);
    setSelectedEvent(null);
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700' }}>Event Attendance</h1>
          <p style={{ color: '#a1a1aa' }}>Record and manage attendance for specific events</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '12px 24px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Record Event Attendance'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px' }}>{success}</div>}

      {showAddForm && (
        <AddAttendanceForm 
          onAttendanceAdded={handleAttendanceAdded} 
          initialData={editingRecord} 
          isEdit={!!editingRecord}
          activeTab="event"
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading event attendance...</div>
      ) : (
        <div className="card">
          <AttendanceTable 
            attendance={attendance} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
            onViewEvent={handleViewEvent}
            onViewSermon={() => {}}   // Not needed for this page
            activeTab="event"
          />
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
              <h3>{selectedEvent.name}</h3>
              <button 
                onClick={closeModals}
                style={{
                  background: 'transparent',
                  border: '1px solid #f87171',
                  color: '#f87171',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
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
    </div>
  );
}