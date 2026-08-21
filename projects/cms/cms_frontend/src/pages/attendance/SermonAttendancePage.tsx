import { useState, useEffect } from 'react';
import { fetchAttendance, deleteAttendance } from '../../api/attendanceApi';
import BackButton from '../../components/common/BackButton';
import AddAttendanceForm from '../../components/forms/AddAttendanceForm';
import { AttendanceTable } from '../../components/tables/AttendanceTable';

export default function SermonAttendancePage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [filteredAttendance, setFilteredAttendance] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [showSermonModal, setShowSermonModal] = useState(false);
  const [selectedSermon, setSelectedSermon] = useState<any>(null);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetchAttendance();
      const sermonOnly = (res.data || res || []).filter((a: any) => a.sermonId !== null);
      setAttendance(sermonOnly);
      setFilteredAttendance(sermonOnly);
    } catch (err: any) {
      setError('Failed to load sermon attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredAttendance(attendance);
      return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = attendance.filter(record =>
      record.attendeeMember?.firstName?.toLowerCase().includes(term) ||
      record.attendeeMember?.lastName?.toLowerCase().includes(term) ||
      record.guestName?.toLowerCase().includes(term) ||
      record.attendanceType?.toLowerCase().includes(term) ||
      record.attendedSermon?.title?.toLowerCase().includes(term)
    );
    setFilteredAttendance(filtered);
  }, [searchTerm, attendance]);

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

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingRecord(null);
  };

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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', margin: 0 }}>Sermon Attendance</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Record and manage attendance for specific sermons</p>
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
          {showAddForm ? 'Cancel' : '+ Record Sermon Attendance'}
        </button>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px', 
        flexWrap: 'wrap',
        flexDirection: window.innerWidth < 500 ? 'column' : 'row'
      }}>
        <input
          type="text"
          placeholder="Search by name, guest or sermon..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{success}</div>}

      {showAddForm && (
        <AddAttendanceForm 
          onAttendanceAdded={handleAttendanceAdded} 
          initialData={editingRecord} 
          isEdit={!!editingRecord}
          activeTab="sermon"
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading sermon attendance...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <AttendanceTable 
                attendance={filteredAttendance} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onViewEvent={() => {}}
                onViewSermon={handleViewSermon}
                activeTab="sermon"
              />
            </div>
          )}
        </>
      )}

      {showSermonModal && selectedSermon && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #27272a', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Sermon Details</h3>
              <button onClick={closeModals} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                Close
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa', width: '100px' }}>Title</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{selectedSermon.title}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Date Preached</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{new Date(selectedSermon.datePreached).toLocaleDateString()}</td>
                  </tr>
                  {selectedSermon.speaker && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Speaker</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{selectedSermon.speaker.firstName} {selectedSermon.speaker.lastName}</td>
                    </tr>
                  )}
                  {selectedSermon.guestSpeakerName && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Guest Speaker</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{selectedSermon.guestSpeakerName}</td>
                    </tr>
                  )}
                  {selectedSermon.content && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Content</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{selectedSermon.content}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}