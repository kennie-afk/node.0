// src/pages/attendance/SermonAttendancePage.tsx
import { useState, useEffect } from 'react';
import { fetchAttendance, deleteAttendance } from '../../api/attendanceApi';
import AddAttendanceForm from '../../components/forms/AddAttendanceForm';
import { AttendanceTable } from '../../components/tables/AttendanceTable';

export default function SermonAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Modals
  const [showSermonModal, setShowSermonModal] = useState(false);
  const [selectedSermon, setSelectedSermon] = useState<any>(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetchAttendance();
      const sermonOnly = (res.data || res || []).filter((a: any) => a.sermonId !== null);
      setAttendance(sermonOnly);
    } catch (err: any) {
      setError('Failed to load sermon attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceAdded = () => {
    setSuccess('Sermon attendance recorded successfully');
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

  const handleViewSermon = (sermonId: number) => {
    const sermon = attendance.find(a => a.sermonId === sermonId)?.attendedSermon;
    if (sermon) {
      setSelectedSermon(sermon);
      setShowSermonModal(true);
    }
  };

  const closeModals = () => {
    setShowSermonModal(false);
    setSelectedSermon(null);
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700' }}>Sermon Attendance</h1>
          <p style={{ color: '#a1a1aa' }}>Record and manage attendance for specific sermons</p>
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
          {showAddForm ? 'Cancel' : '+ Record Sermon Attendance'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px' }}>{success}</div>}

      {showAddForm && (
        <AddAttendanceForm 
          onAttendanceAdded={handleAttendanceAdded} 
          initialData={editingRecord} 
          isEdit={!!editingRecord}
          activeTab="sermon"
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading sermon attendance...</div>
      ) : (
        <div className="card">
          <AttendanceTable 
            attendance={attendance} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
            onViewEvent={() => {}}     // Not needed here
            onViewSermon={handleViewSermon}
            activeTab="sermon"
          />
        </div>
      )}

      {/* Sermon Modal */}
      {showSermonModal && selectedSermon && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
              <h3>{selectedSermon.title}</h3>
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
              <p><strong>Date Preached:</strong> {new Date(selectedSermon.datePreached).toLocaleDateString()}</p>
              {selectedSermon.content && <p><strong>Content:</strong> {selectedSermon.content}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}