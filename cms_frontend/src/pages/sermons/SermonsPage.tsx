import { useState, useEffect } from 'react';
import type { Sermon } from '../../api/sermonApi';
import { fetchSermons, deleteSermon } from '../../api/sermonApi';
import BackButton from '../../components/common/BackButton';
import AddSermonForm from '../../components/forms/AddSermonForm';
import { SermonTable } from '../../components/tables/SermonTable';

export default function SermonsPage() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
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
      setSermons(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load sermons');
    } finally {
      setLoading(false);
    }
  };

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
                sermons={sermons} 
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
          inset: 0, 
          background: 'rgba(0,0,0,0.85)', 
          zIndex: 2000, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>{viewingSermon.title}</h3>
              <button 
                onClick={closeViewModal}
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
              <p><strong>Date Preached:</strong> {new Date(viewingSermon.datePreached).toLocaleDateString()}</p>
              {viewingSermon.speaker && (
                <p><strong>Speaker:</strong> {viewingSermon.speaker.firstName} {viewingSermon.speaker.lastName}</p>
              )}
              {viewingSermon.guestSpeakerName && (
                <p><strong>Guest Speaker:</strong> {viewingSermon.guestSpeakerName}</p>
              )}
              {viewingSermon.passageReference && <p><strong>Passage:</strong> {viewingSermon.passageReference}</p>}
              {viewingSermon.content && <p><strong>Content:</strong> {viewingSermon.content}</p>}
              {viewingSermon.summary && <p><strong>Summary:</strong> {viewingSermon.summary}</p>}
              {viewingSermon.audioUrl && <p><strong>Audio:</strong> <a href={viewingSermon.audioUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ec4899' }}>Listen</a></p>}
              {viewingSermon.videoUrl && <p><strong>Video:</strong> <a href={viewingSermon.videoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ec4899' }}>Watch</a></p>}
              {viewingSermon.notes && <p><strong>Notes:</strong> {viewingSermon.notes}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}