import { useState, useEffect } from 'react';
import type { Sermon } from '../../api/sermonApi';
import { fetchSermons, deleteSermon } from '../../api/sermonApi';
import BackButton from '../../components/common/BackButton';
import AddSermonForm from '../../components/forms/AddSermonForm';
import { SermonTable } from '../../components/tables/SermonTable';

export default function SermonsPage() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [filteredSermons, setFilteredSermons] = useState<Sermon[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSermon, setEditingSermon] = useState<Sermon | null>(null);
  const [viewingSermon, setViewingSermon] = useState<Sermon | null>(null);

  const loadSermons = async () => {
    try {
      setLoading(true);
      const res = await fetchSermons();
      const data = res;
      setSermons(data);
      setFilteredSermons(data);
    } catch (err: any) {
      setError('Failed to load sermons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSermons(sermons);
      return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = sermons.filter(sermon =>
      sermon.title?.toLowerCase().includes(term) ||
      sermon.passageReference?.toLowerCase().includes(term) ||
      sermon.summary?.toLowerCase().includes(term)
    );
    setFilteredSermons(filtered);
  }, [searchTerm, sermons]);

  const handleSermonAdded = () => {
    setSuccess('Sermon saved successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    setEditingSermon(null);
    loadSermons();
  };

  const handleEdit = (sermon: Sermon) => {
    setEditingSermon(sermon);
    setShowAddForm(true);
  };

  const handleView = (sermon: Sermon) => {
    setViewingSermon(sermon);
  };

  const closeViewModal = () => {
    setViewingSermon(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this sermon?')) return;
    try {
      await deleteSermon(id);
      setSuccess('Sermon deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadSermons();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete sermon');
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingSermon(null);
  };

  useEffect(() => {
    loadSermons();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>Sermons</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage church teachings and sermons</p>
        </div>

        <button 
          onClick={() => {
            setEditingSermon(null);
            setShowAddForm(!showAddForm);
          }}
          style={{
            padding: '10px 20px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 3.5vw, 14px)',
            flexShrink: 0
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Sermon'}
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
          placeholder="Search by title, passage or summary..."
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

      {error && (
        <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {success}
        </div>
      )}

      {showAddForm && (
        <AddSermonForm 
          onSermonAdded={handleSermonAdded} 
          initialData={editingSermon} 
          isEdit={!!editingSermon}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading sermons...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <SermonTable 
                sermons={filteredSermons} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onView={handleView}
              />
            </div>
          )}
        </>
      )}

      {viewingSermon && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '550px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Sermon Details</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid #f87171',
                  color: '#f87171',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa', width: '120px' }}>Title</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.title}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Date Preached</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.datePreached ? new Date(viewingSermon.datePreached).toLocaleDateString() : '-'}</td>
                  </tr>
                  {viewingSermon.speaker && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Speaker</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.speaker.firstName} {viewingSermon.speaker.lastName}</td>
                    </tr>
                  )}
                  {viewingSermon.guestSpeakerName && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Guest Speaker</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.guestSpeakerName}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Passage Reference</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.passageReference || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Summary</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.summary || '-'}</td>
                  </tr>
                  {viewingSermon.audioUrl && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Audio</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>
                        <a href={viewingSermon.audioUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ec4899' }}>Listen</a>
                      </td>
                    </tr>
                  )}
                  {viewingSermon.videoUrl && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Video</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>
                        <a href={viewingSermon.videoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ec4899' }}>Watch</a>
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Notes</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.notes || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingSermon.createdAt ? new Date(viewingSermon.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}