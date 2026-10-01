import { useState, useEffect } from 'react';
import type { Sermon } from '../../api/sermonApi';
import { fetchSermons, deleteSermon } from '../../api/sermonApi';
import BackButton from '../../components/common/BackButton';
import AddSermonForm from '../../components/forms/AddSermonForm';
import { SermonTable } from '../../components/tables/SermonTable';
import { describeError } from '../../api/errors';

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
      setError(describeError(err, 'Failed to delete sermon'));
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
          <h1 style={{ fontSize: '16.5px', fontWeight: '700', color: 'var(--c-text)', margin: 0 }}>Sermons</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Manage church teachings and sermons</p>
        </div>

        <button 
          onClick={() => {
            setEditingSermon(null);
            setShowAddForm(!showAddForm);
          }}
          style={{
            padding: '10px 20px',
            background: 'var(--c-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '11.5px',
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
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '12px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--c-bad)', padding: '12px', background: 'var(--c-bad-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: 'var(--c-ok)', padding: '12px', background: 'var(--c-ok-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>
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
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>Loading sermons...</div>
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
              borderBottom: '1px solid var(--c-border)',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: '600' }}>Sermon Details</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--c-bad)',
                  color: 'var(--c-bad)',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11.5px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)', width: '120px' }}>Title</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.title}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Date Preached</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.datePreached ? new Date(viewingSermon.datePreached).toLocaleDateString() : '-'}</td>
                  </tr>
                  {viewingSermon.speaker && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Speaker</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.speaker.firstName} {viewingSermon.speaker.lastName}</td>
                    </tr>
                  )}
                  {viewingSermon.guestSpeakerName && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Guest Speaker</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.guestSpeakerName}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Passage Reference</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.passageReference || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Summary</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.summary || '-'}</td>
                  </tr>
                  {viewingSermon.audioUrl && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Audio</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>
                        <a href={viewingSermon.audioUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-accent)' }}>Listen</a>
                      </td>
                    </tr>
                  )}
                  {viewingSermon.videoUrl && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Video</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>
                        <a href={viewingSermon.videoUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-accent)' }}>Watch</a>
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Notes</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.notes || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingSermon.createdAt ? new Date(viewingSermon.createdAt).toLocaleDateString() : '-'}</td>
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